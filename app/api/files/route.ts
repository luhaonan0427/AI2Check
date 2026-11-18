import { env } from 'cloudflare:workers';
import { getIdentity } from '@/app/chatgpt-auth';
import { database } from '@/db/store';

/** 上传一张作业原图。存储在调用者自己的命名空间下。 */
export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: '请先登录' }, { status: 401 });
    if (
      request.headers.get('origin') &&
      request.headers.get('origin') !== new URL(request.url).origin
    ) {
      return Response.json({ error: '请求来源无效' }, { status: 403 });
    }
    if (!env.BUCKET) return Response.json({ error: '图片存储暂不可用' }, { status: 503 });

    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > 8 * 1024 * 1024 + 10_000) {
      return Response.json({ error: '每张图片不得超过 8 MB' }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (
      !(file instanceof File) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size === 0 ||
      file.size > 8 * 1024 * 1024
    ) {
      return Response.json({ error: '请上传 8 MB 内的 JPG、PNG 或 WebP 图片' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    // 不信任 Content-Type，校验文件头，避免改扩展名绕过。
    const valid =
      (file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (file.type === 'image/png' &&
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71) ||
      (file.type === 'image/webp' &&
        String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP');
    if (!valid) {
      return Response.json({ error: '图片格式与文件内容不符，请重新选择' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await env.BUCKET.put(`${identity.userId}/${id}`, bytes, {
      httpMetadata: { contentType: file.type },
    });
    return Response.json({ id });
  } catch (error) {
    console.error(error);
    return Response.json({ error: '图片上传失败，请稍后重试' }, { status: 503 });
  }
}

/**
 * 读取作业原图。
 * 越权防护：上传者本人，或该图片所属提交的任课教师，才可以读取。
 * 图片 id 是随机 UUID，但仍显式校验归属，不依赖「猜不到」。
 */
export async function GET(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return new Response('Unauthorized', { status: 401 });
    if (!env.BUCKET) return new Response('Storage unavailable', { status: 503 });

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const owner = url.searchParams.get('owner');
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) return new Response('Not found', { status: 404 });

    // 读取他人（学生）的图片：必须是该提交所属课程的授课教师。
    if (owner && owner !== identity.userId) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(owner)) return new Response('Not found', { status: 404 });
      const row = await database()
        .prepare(
          'SELECT c.teacher_id AS teacherId FROM submissions s JOIN courses c ON c.id = s.course_id WHERE s.student_id = ? AND s.files LIKE ?',
        )
        .bind(owner, `%${id}%`)
        .first<{ teacherId: string }>();
      if (!row || row.teacherId !== identity.userId) {
        return new Response('Forbidden', { status: 403 });
      }
      const shared = await env.BUCKET.get(`${owner}/${id}`);
      if (!shared) return new Response('Not found', { status: 404 });
      return new Response(shared.body, {
        headers: {
          'Content-Type': shared.httpMetadata?.contentType ?? 'image/jpeg',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const own = await env.BUCKET.get(`${identity.userId}/${id}`);
    if (!own) return new Response('Not found', { status: 404 });

    return new Response(own.body, {
      headers: {
        'Content-Type': own.httpMetadata?.contentType ?? 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(error);
    return new Response('Storage unavailable', { status: 503 });
  }
}
