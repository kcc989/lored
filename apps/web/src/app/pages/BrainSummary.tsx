import { requestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { AppLayout } from '../app-layout';
import { BrainSummaryContent } from '@/components/brain/brain-summary-content';

const paramsSchema = z.object({ brainId: z.string() });

export const BrainSummary = () => {
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
          <BrainSummaryContent brainId={brainId} />
        </div>
      </div>
    </AppLayout>
  );
};
