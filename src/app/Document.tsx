import type { DocumentProps } from 'rwsdk/router';
import { requestInfo } from 'rwsdk/worker';

export function Document({ children }: DocumentProps) {
  const { ctx } = requestInfo;
  const theme = ctx.theme || 'light';

  return (
    <html lang="en" className={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>App Name</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="modulepreload" href="/src/client.tsx" />
        <link rel="stylesheet" href="/src/global.css" />
      </head>
      <body>
        <div id="root">{children}</div>
        <script>import("/src/client.tsx")</script>
      </body>
    </html>
  );
};
