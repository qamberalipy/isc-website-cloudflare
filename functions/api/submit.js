export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Parse the incoming multi-page form fields
  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());
  const token = formData.get('cf-turnstile-response');

  // 2. Protect with Cloudflare Turnstile CAPTCHA
  if (!token) {
    return new Response('Missing Security Verification Token', { status: 400 });
  }

  const turnstileVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${env.TURNSTILE_SECRET_KEY}&response=${token}`
  });

  const turnstileResult = await turnstileVerify.json();
  if (!turnstileResult.success) {
    return new Response('Security Verification Failed', { status: 400 });
  }

  // 3. Format email body string beautifully
  let emailBody = `You have received a new website form submission.\n\n`;
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'cf-turnstile-response' && value) {
      // Clean up field names for readability
      const cleanKey = key.replace('-', ' ').toUpperCase();
      emailBody += `${cleanKey}: ${value}\n`;
    }
  }

  // 4. Dispatch payload to Resend API
  // const resendPayload = {
  //   // NOTE: Change 'onboarding@resend.dev' to 'noreply@isccredit.com' ONLY after domain records propagate
  //   from: 'ISC Website Forms <onboarding@resend.dev>', 
  //   to: 'sales@isccredit.com',
  //   subject: `New Lead Notification - ${data.name || data['contact-name'] || 'New Contact'}`,
  //   text: emailBody
  // };

const resendPayload = {
  from: 'ISC Website Forms <noreply@isccredit.com>', // Updated to your verified domain
  to: 'sales@isccredit.com', 
  subject: `New Lead Notification - ${data.name || data['contact-name'] || 'New Contact'}`,
  text: emailBody
};

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(resendPayload)
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return new Response(`Email Dispatch Failed: ${errorText}`, { status: 500 });
  }

  // 5. Success Redirect back to originating page with parameter
  const referer = request.headers.get('Referer') || '/';
  const url = new URL(referer);
  url.searchParams.set('success', 'true');

  return Response.redirect(url.toString(), 303);
}