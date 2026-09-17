/** HTML body for OIDC-config HTTP 403 (extended forbidden; not login-unavailable). */
export function extendedForbiddenBody(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Login cannot start</title>
</head>
<body>
<main>
<h1>Login cannot start</h1>
<p>Required login configuration is missing or invalid for this tenant. Contact your administrator to fix the configuration, then try again.</p>
<p><a href="/">Return home</a></p>
</main>
</body>
</html>`
}
