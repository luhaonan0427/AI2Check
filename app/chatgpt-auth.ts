// 身份获取。身份始终来自平台注入的请求头，前端无法伪造。
// 角色（教师/学生）来自 users 表，由 db/store 决定，前端同样无法提权。
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ensureUser, findUser } from '@/db/store';
import type { User } from './domain';

const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER = 'oai-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';
const SIGN_IN_PATH = '/signin-with-chatgpt';
const SIGN_OUT_PATH = '/signout-with-chatgpt';
const CALLBACK_PATH = '/callback';

export type Identity = {
  userId: string;
  displayName: string;
  email: string | null;
  fullName: string | null;
};

/** 只读取身份，不建档。用于判断是否登录。 */
export async function getIdentity(): Promise<Identity | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName && requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

/** 读取身份并确保 users 表里有对应记录。 */
export async function getCurrentUser(): Promise<User | null> {
  const identity = await getIdentity();
  if (!identity) return null;
  return ensureUser({
    id: identity.userId,
    displayName: identity.displayName,
    email: identity.email,
  });
}

/** 只读当前用户，不自动建档（查询接口用，避免读请求产生副作用）。 */
export async function getExistingUser(): Promise<User | null> {
  const identity = await getIdentity();
  if (!identity) return null;
  return findUser(identity.userId);
}

export async function requireUser(): Promise<User> {
  const identity = await getIdentity();
  if (!identity) redirect(chatGPTSignInPath('/'));
  return ensureUser({
    id: identity.userId,
    displayName: identity.displayName,
    email: identity.email,
  });
}

export async function requireTeacher(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'teacher') throw new Error('需要教师权限');
  return user;
}

export async function requireStudent(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'student') throw new Error('需要学生权限');
  return user;
}

export function roleHome(role: User['role'] | null): string {
  if (role === 'teacher') return '/teacher';
  if (role === 'student') return '/student';
  return '/welcome';
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
