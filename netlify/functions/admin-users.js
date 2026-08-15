// netlify/functions/admin-users.js
//
// Server-side user management for Supabase Auth. This is the ONLY place
// in the whole system allowed to create, edit, or delete login accounts,
// because doing so requires the Supabase service_role key — a key that
// must never reach the browser (it bypasses RLS entirely).
//
// Required Netlify environment variables (server-side only):
//   SUPABASE_URL              (already set for the rest of the app)
//   SUPABASE_SERVICE_ROLE_KEY (NEW — from Supabase Dashboard > Project
//                               Settings > API > service_role secret key.
//                               Do NOT reuse the anon key here.)
//
// Every request (except the one-time bootstrap described below) must
// carry the caller's own Supabase session access token in the
// Authorization header: `Authorization: Bearer <access_token>`. The
// function looks that user up, confirms role === 'admin' in their
// user_metadata, and only then performs the requested action.
//
// Bootstrap exception: if there are currently ZERO auth users at all,
// a single `create` call is allowed through without an admin token —
// this is how you create the very first admin account. The role on
// that first account is always forced to 'admin' regardless of what
// the request asked for, and the bootstrap path disables itself the
// moment any user exists.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' })
    };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const { action, payload } = body;
  if (!action) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing action.' }) };
  }

  // ── Identify the caller from their access token (if any) ──
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let callerIsAdmin = false;
  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user?.user_metadata?.role === 'admin') {
      callerIsAdmin = true;
    }
  }

  // ── Bootstrap: allow exactly one unauthenticated 'create' when no users exist yet ──
  let bootstrapMode = false;
  if (!callerIsAdmin && action === 'create') {
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!listErr && listData && listData.users && listData.users.length === 0) {
      bootstrapMode = true;
    }
  }

  if (!callerIsAdmin && !bootstrapMode) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Admin permission required.' }) };
  }

  try {
    switch (action) {
      case 'list': {
        // Supabase's admin listUsers is paginated; pull everything (small business app, low user count).
        let all = [];
        let page = 1;
        const perPage = 200;
        while (true) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
          if (error) throw error;
          all = all.concat(data.users || []);
          if (!data.users || data.users.length < perPage) break;
          page++;
        }
        const users = all.map(u => ({
          id: u.id,
          email: u.email,
          username: u.user_metadata?.username || u.email,
          display_name: u.user_metadata?.display_name || u.user_metadata?.username || u.email,
          role: u.user_metadata?.role || 'user',
          created_at: u.created_at
        }));
        return { statusCode: 200, body: JSON.stringify({ users }) };
      }

      case 'create': {
        const { email, password, username, display_name, role } = payload || {};
        if (!email || !password) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Email and password are required.' }) };
        }
        const finalRole = bootstrapMode ? 'admin' : (role || 'user');

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            username: username || email.split('@')[0],
            display_name: display_name || username || email.split('@')[0],
            role: finalRole
          }
        });
        if (error) throw error;
        return { statusCode: 200, body: JSON.stringify({ id: data.user.id, bootstrap: bootstrapMode }) };
      }

      case 'update': {
        const { id, email, password, username, display_name, role } = payload || {};
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing user id.' }) };

        const { data: existing, error: getErr } = await admin.auth.admin.getUserById(id);
        if (getErr || !existing?.user) return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };

        const updates = {};
        if (email) updates.email = email;
        if (password) updates.password = password;
        updates.user_metadata = {
          ...existing.user.user_metadata,
          ...(username !== undefined ? { username } : {}),
          ...(display_name !== undefined ? { display_name } : {}),
          ...(role !== undefined ? { role } : {})
        };

        const { error } = await admin.auth.admin.updateUserById(id, updates);
        if (error) throw error;
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }

      case 'delete': {
        const { id } = payload || {};
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing user id.' }) };
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action "${action}".` }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal Server Error' }) };
  }
};
