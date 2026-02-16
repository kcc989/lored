import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { db } from '@/db';
import { UnauthorizedError, ValidationError } from '@/lib/errors';

// Schemas
const updateProfileInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  username: z.string().min(1).max(50).optional(),
  image: z.string().url().optional(),
});

const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Types
export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  username: string | null;
};

export type AvatarUploadResponse = {
  url: string;
};

/**
 * Get the current user's profile
 */
export async function getCurrentUser({
  ctx,
}: RequestInfo): Promise<Response> {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }

  const user = await db
    .selectFrom('user')
    .where('user.id', '=', ctx.user.id)
    .select(['id', 'email', 'name', 'image', 'username'])
    .executeTakeFirst();

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return Response.json({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    username: user.username,
  } satisfies UserProfile);
}

/**
 * Update the current user's profile
 */
export async function updateProfile({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }

  const body = await request.json();
  const input = updateProfileInputSchema.parse(body);

  // Build update object with only provided fields
  const updates: Record<string, string> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    updates.name = input.name;
  }
  if (input.username !== undefined) {
    updates.username = input.username;
  }
  if (input.image !== undefined) {
    updates.image = input.image;
  }

  await db
    .updateTable('user')
    .set(updates)
    .where('id', '=', ctx.user.id)
    .execute();

  // Return updated user
  const user = await db
    .selectFrom('user')
    .where('user.id', '=', ctx.user.id)
    .select(['id', 'email', 'name', 'image', 'username'])
    .executeTakeFirst();

  return Response.json({
    id: user!.id,
    email: user!.email,
    name: user!.name,
    image: user!.image,
    username: user!.username,
  } satisfies UserProfile);
}

/**
 * Upload an avatar image to R2 and update user's image URL
 */
export async function uploadAvatar({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }

  const contentType = request.headers.get('content-type') || '';

  // Handle multipart form data
  if (!contentType.includes('multipart/form-data')) {
    throw new ValidationError('Expected multipart/form-data');
  }

  const formData = await request.formData();
  const file = formData.get('avatar');

  if (!file || !(file instanceof File)) {
    throw new ValidationError('No avatar file provided');
  }

  // Validate file type
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    throw new ValidationError(
      `Invalid file type. Allowed types: ${AVATAR_ALLOWED_TYPES.join(', ')}`
    );
  }

  // Validate file size
  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new ValidationError(
      `File too large. Maximum size is ${AVATAR_MAX_SIZE_BYTES / 1024 / 1024}MB`
    );
  }

  // Generate unique filename
  const extension = file.type.split('/')[1] || 'png';
  const filename = `avatars/${ctx.user.id}/${Date.now()}.${extension}`;

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer();
  await env.AVATAR_BUCKET.put(filename, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
    },
  });

  // Generate public URL for the avatar
  const avatarUrl = `/api/avatars/${filename}`;

  // Update user's image in database
  await db
    .updateTable('user')
    .set({
      image: avatarUrl,
      updatedAt: new Date().toISOString(),
    })
    .where('id', '=', ctx.user.id)
    .execute();

  return Response.json({ url: avatarUrl } satisfies AvatarUploadResponse);
}

/**
 * Serve an avatar image from R2
 */
export async function serveAvatar({ params }: RequestInfo): Promise<Response> {
  const path = params['*'];

  if (!path) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.AVATAR_BUCKET.get(`avatars/${path}`);

  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

  return new Response(object.body, { headers });
}
