import type { RouteDefinition } from '../lib/http.js';
import type { AuthDeps } from '../controllers/auth.controller.js';
import {
  signupController,
  loginController,
  logoutController,
  meController,
} from '../controllers/auth.controller.js';
import {
  API_AUTH_SIGNUP_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_ME_PATH,
  API_ME_PATH,
} from '@webapp/types';

export function makeAuthRoutes(deps: AuthDeps): RouteDefinition[] {
  return [
    { method: 'POST', path: API_AUTH_SIGNUP_PATH, handler: (ctx) => signupController(ctx, deps) },
    { method: 'POST', path: API_AUTH_LOGIN_PATH,  handler: (ctx) => loginController(ctx, deps) },
    { method: 'POST', path: API_AUTH_LOGOUT_PATH, handler: (ctx) => logoutController(ctx, deps) },
    { method: 'GET',  path: API_AUTH_ME_PATH,     handler: (ctx) => meController(ctx, deps) },
    { method: 'GET',  path: API_ME_PATH,          handler: (ctx) => meController(ctx, deps) },
  ];
}
