import { Router,type Request,type RequestHandler } from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readStore, writeStore } from '../../shared/db/store.js';
type User={id:string;name:string;email:string;picture?:string};
type Session={user:User;expires:number};
const sessions = new Map<string,Session>();
const pending = new Map<string,{expires:number;verifier:string}>();
const tokenHash = (token:string) => createHash('sha256').update(token).digest('hex');
const clientUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
export const authConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 7 * 86400000 });
export async function initAuth() { for (const [key, s] of Object.entries(await readStore<Record<string,Session>>('sessions', {})))
    if (s.expires > Date.now())
        sessions.set(key, s); }
function session(req:Request) { const token = req.cookies?.folio_session; if (typeof token !== 'string')
    return null; const entry = sessions.get(tokenHash(token)); if (!entry || entry.expires < Date.now())
    return null; return entry; }
export function currentUser(req:Request) { return session(req)?.user || null; }
export const requireAuth:RequestHandler = (req, res, next) => { const u = currentUser(req); if (!u) {
    res.status(401).json({ error: 'Đăng nhập Google để lưu từ và sử dụng chức năng này.', code: 'AUTH_REQUIRED' });
    return;
} res.locals.user = u; next(); };
export const authRouter = Router();
authRouter.get('/me', (req, res) => res.json({ user: currentUser(req), configured: authConfigured() }));
authRouter.get('/google', (_req, res) => {
    if (!authConfigured()) {
        res.redirect(`${clientUrl}/?auth_error=not_configured`);
        return;
    }
    const state = randomBytes(24).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    pending.set(state, { expires: Date.now() + 600000, verifier });
    for (const [k, v] of pending)
        if (v.expires < Date.now())
            pending.delete(k);
    res.cookie('folio_oauth_state', state, { ...cookieOptions(), maxAge: 600000 });
    const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
authRouter.get('/google/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookie = req.cookies?.folio_oauth_state;
    const flow = pending.get(state);
    pending.delete(state);
    res.clearCookie('folio_oauth_state', { path: '/' });
    if (!state || typeof cookie !== 'string' || state.length !== cookie.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie)) || !flow || flow.expires < Date.now() || typeof req.query.code !== 'string') {
        res.redirect(`${clientUrl}/?auth_error=invalid_state`);
        return;
    }
    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback', grant_type: 'authorization_code', code_verifier: flow.verifier }) });
        if (!tokenResponse.ok)
            throw new Error('Token exchange failed');
        const tokens = await tokenResponse.json();
        const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000) });
        if (!response.ok)
            throw new Error('Profile request failed');
        const profile = await response.json();
        if (!profile.sub || !profile.email_verified)
            throw new Error('Unverified Google account');
        const user = { id: profile.sub, email: profile.email, name: profile.name, picture: profile.picture };
        const token = randomBytes(32).toString('base64url');
        sessions.set(tokenHash(token), { user, expires: Date.now() + 7 * 86400000 });
        await writeStore('sessions', Object.fromEntries(sessions));
        res.cookie('folio_session', token, cookieOptions());
        res.redirect(clientUrl);
    }
    catch {
        res.redirect(`${clientUrl}/?auth_error=login_failed`);
    }
});
authRouter.post('/logout', async (req, res) => { const token = req.cookies?.folio_session; if (typeof token === 'string') {
    sessions.delete(tokenHash(token));
    await writeStore('sessions', Object.fromEntries(sessions));
} res.clearCookie('folio_session', { path: '/' }); res.json({ ok: true }); });
