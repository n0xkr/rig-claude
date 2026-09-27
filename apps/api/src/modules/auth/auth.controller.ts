import type { FastifyReply, FastifyRequest } from "fastify";
import { LoginSchema } from "@rigabras/shared";
import { AuthService } from "./auth.service.js";
import { parseOrProblem } from "../../middleware/validate.js";
import { Problems } from "../../lib/problemDetails.js";
import { DomainError } from "../../lib/errors.js";

const service = new AuthService();
const REFRESH_COOKIE = "rigabras_refresh_token";

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export const AuthController = {
  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrProblem(LoginSchema, request.body, reply);
    if (!body) return;
    try {
      const session = await service.login(body.email, body.password);
      setRefreshCookie(reply, session.refreshToken);
      return reply.send({ accessToken: session.accessToken, profile: session.profile });
    } catch (error) {
      if (error instanceof DomainError) {
        return Problems.unauthorized(reply, error.detail ?? error.message);
      }
      throw error;
    }
  },

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) {
      return Problems.unauthorized(reply, "Refresh token ausente");
    }
    try {
      const session = await service.refresh(token);
      setRefreshCookie(reply, session.refreshToken);
      return reply.send({ accessToken: session.accessToken, profile: session.profile });
    } catch (error) {
      if (error instanceof DomainError) {
        return Problems.unauthorized(reply, error.detail ?? error.message);
      }
      throw error;
    }
  },

  async logout(_request: FastifyRequest, reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
    return reply.status(204).send();
  },
};
