import { requestInfo } from 'rwsdk/worker';

export const RealtimeDocument: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { ctx } = requestInfo;
  const theme = ctx.theme || 'light';

  return (
    <html lang="en" className={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>App Name</title>
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body>
        <div id="root">{children}</div>
        <script>import("/src/realtime-client.tsx")</script>
        <link rel="stylesheet" href="/src/global.css" />
      </body>
    </html>
  );
};
