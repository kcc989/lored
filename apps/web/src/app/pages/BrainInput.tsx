import { requestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { AppLayout } from '../app-layout';
import { BrainInputContent } from '@/components/brain/brain-input-content';

const paramsSchema = z.object({ brainId: z.string() });

export const BrainInput = () => {
  const { ctx, params } = requestInfo;
  const { brainId } = paramsSchema.parse(params);

  if (!ctx.user || !ctx.activeOrganization) {
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: 'window.location.href = "/";',
        }}
      />
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Add Data
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Import content from your integrations or paste text directly.
            </p>
          </div>
          <BrainInputContent brainId={brainId} />
        </div>
      </div>
    </AppLayout>
  );
};
