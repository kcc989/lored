import { requestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { BrainDetailContent } from '@/components/brain/brain-detail-content';

const paramsSchema = z.object({ brainId: z.string() });

export const BrainDetail = () => {
  const { ctx, params } = requestInfo;
  const { brainId } = paramsSchema.parse(params);

  if (!ctx.user || !ctx.activeOrganization) {
    return (
      <script
        nonce={requestInfo.rw.nonce}
        dangerouslySetInnerHTML={{
          __html: 'window.location.href = "/";',
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <BrainDetailContent brainId={brainId} />
      </div>
    </div>
  );
};
