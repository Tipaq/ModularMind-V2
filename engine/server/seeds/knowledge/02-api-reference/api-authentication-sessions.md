# API Reference — Authentication & Sessions

## Overview

ModularMind uses JWT-based authentication with HttpOnly cookie transport. Sessions are stateless and managed via access/refresh token pairs. All authenticated endpoints require a valid session cookie.

## Base URL

```
Production: https://api.modularmind.io
Development: http://localhost:8000
```

## Authentication Flow

```
1. POST /auth/login          → Set-Cookie: access_token, refresh_token
2. Authenticated requests    → Cookie automatically sent
3. Token expires (15min)     → Auto-refresh via refresh_token
4. POST /auth/logout         → Clear cookies
```

## Endpoints

### POST /auth/login

Authenticate a user and establish a session.

**Request:**
```json
{
  "email": "user@company.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "usr_abc123",
    "email": "user@company.com",
    "name": "Jean Dupont",
    "role": "operator",
    "groups": ["engineering", "backend"],
    "created_at": "2025-06-15T10:30:00Z"
  }
}
```

**Cookies Set:**
| Cookie | Value | Max-Age | Flags |
|--------|-------|---------|-------|
| `access_token` | JWT (15min) | 900 | HttpOnly, Secure, SameSite=Lax |
| `refresh_token` | JWT (7d) | 604800 | HttpOnly, Secure, SameSite=Lax, Path=/auth |

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `invalid_credentials` | Email or password incorrect |
| 403 | `account_disabled` | User account has been deactivated |
| 429 | `rate_limited` | Too many login attempts (max 5/min) |

### POST /auth/refresh

Refresh an expired access token using the refresh token.

**Request:** No body required. The refresh token is sent automatically via cookie.

**Response (200):**
```json
{
  "message": "Token refreshed"
}
```

A new `access_token` cookie is set with a fresh 15-minute expiration.

**Error Response (401):**
```json
{
  "detail": "Refresh token expired or invalid"
}
```

### POST /auth/logout

Invalidate the current session and clear all authentication cookies.

**Response (204):** No content. Cookies are cleared.

### GET /auth/me

Get the current authenticated user's profile.

**Response (200):**
```json
{
  "id": "usr_abc123",
  "email": "user@company.com",
  "name": "Jean Dupont",
  "role": "admin",
  "groups": ["engineering", "backend", "devops"],
  "avatar_url": null,
  "last_login": "2026-03-01T08:45:00Z",
  "created_at": "2025-06-15T10:30:00Z"
}
```

### PUT /auth/me/password

Change the current user's password.

**Request:**
```json
{
  "current_password": "oldpassword123",
  "new_password": "newSecureP@ssw0rd"
}
```

**Validation Rules:**
- Minimum 8 characters
- At least one uppercase, one lowercase, one digit
- Must not be the same as the current password
- Must not be in the list of common passwords

**Response (200):**
```json
{
  "message": "Password updated successfully"
}
```

## RBAC Roles

### Role Hierarchy

```
admin > operator > user
```

### Permission Matrix

| Resource | user | operator | admin |
|----------|------|----------|-------|
| Chat (own conversations) | Read/Write | Read/Write | Read/Write |
| Chat (all conversations) | — | Read | Read/Write |
| Agents | — | CRUD | CRUD |
| Graphs | — | CRUD | CRUD |
| RAG Collections (GLOBAL) | Read/Search | CRUD | CRUD |
| RAG Collections (GROUP) | Read/Search* | CRUD | CRUD |
| Memory (own) | Read/Delete | Read/Delete | Read/Delete |
| Memory (admin) | — | — | Full |
| Users | — | — | CRUD |
| System Settings | — | Read | Read/Write |
| Monitoring | — | Read | Read/Write |

*GROUP collections: user must belong to one of the allowed groups.

## JWT Token Structure

### Access Token Payload

```json
{
  "sub": "usr_abc123",
  "email": "user@company.com",
  "role": "operator",
  "groups": ["engineering", "backend"],
  "iat": 1709280000,
  "exp": 1709280900,
  "type": "access"
}
```

### Refresh Token Payload

```json
{
  "sub": "usr_abc123",
  "iat": 1709280000,
  "exp": 1709884800,
  "type": "refresh"
}
```

## Error Response Format

All authentication errors follow this format:

```json
{
  "detail": "Human-readable error message",
  "code": "error_code",
  "status": 401
}
```

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /auth/login | 5 requests | 1 minute |
| POST /auth/refresh | 10 requests | 1 minute |
| POST /auth/logout | 5 requests | 1 minute |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1709280060
```

## Security Considerations

- Tokens are transported exclusively via HttpOnly cookies (not localStorage)
- CSRF protection via SameSite=Lax cookie attribute
- Access tokens have short TTL (15 minutes) to limit exposure
- Refresh tokens are scoped to `/auth` path only
- Failed login attempts are rate-limited and logged for security monitoring
- All authentication events are emitted to the audit log
