export async function onRequestPost(context) {
  // context.request is the incoming Request object
  // context.env holds your environment variables (like your Resend API key)
  const { request, env } = context;

  // 1. Parse the incoming form data
  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());
  
  // Extract Turnstile token
  const token = formData.get('cf-turnstile-response');

  // 2. Validate Turnstile Token
  if (!token) {
    return new Response('Missing CAPTCHA', { status: 400 });
  }

  const turnstileVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${env.TURNSTILE_SECRET_KEY}&response=${token}`
  });

  const turnstileResult = await turnstileVerify.json();
  if (!turnstileResult.success) {
    return new Response('CAPTCHA verification failed', { status: 400 });
  }

  // 3. Format the email payload
  // Cleanly format all submitted fields (ignores the turnstile token in the email body)
  let emailBody = 'New Form Submission:\n\n';
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'cf-turnstile-response') {
      emailBody += `${key}: ${value}\n`;
    }
  }

  // 4. Send the email via Resend
  // Brian explicitly requested all forms go to sales@isccredit.com
  const resendPayload = {
    from: 'Website Form <onboarding@resend.dev>', // You will update this to their verified domain later
    to: 'sales@isccredit.com',
    subject: `New Lead from ISC Website: ${data.name || 'Unknown'}`,
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
    return new Response('Failed to send email', { status: 500 });
  }

  // 5. Redirect the user back to the page with a success parameter
  const referer = request.headers.get('Referer') || '/';
  const url = new URL(referer);
  url.searchParams.set('success', 'true');

  return Response.redirect(url.toString(), 303);
}