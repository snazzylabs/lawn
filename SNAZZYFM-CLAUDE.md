# Snazzy.fm Link Shortener API — Implementation Guide for Claude

> **Purpose:** This document instructs you, the AI assistant, on how to correctly integrate the [snazzy.fm](https://snazzy.fm/developers) custom link shortener API into the web application. Follow every detail precisely. Do not invent endpoints, parameters, or response shapes that are not described here.

---

## Overview

The snazzy.fm API is a RESTful link shortener service. All requests must be authenticated with a Bearer token. All responses are JSON. The **Links** section of the API is the primary integration target and covers creating, reading, updating, and deleting shortened URLs.

The base URL for all API calls is:

```
https://snazzy.fm/api
```

---

## 1. Authentication

Every single API request **must** include the following HTTP header:

```
Authorization: Bearer YOUR_SNAZZY_API_KEY
Content-Type: application/json
```

The API key is unique to the account and is available in the developer dashboard at `https://snazzy.fm/developers`. Store it securely as an environment variable (for example, `SNAZZY_API_KEY`) and never hardcode it in client-side code.

**Example header (Node.js / fetch):**

```js
const headers = {
  'Authorization': 'Bearer YOUR_SNAZZY_API_KEY',
  'Content-Type': 'application/json',
};
```

---

## 2. Rate Limiting

The API enforces a rate limit of **30 requests per minute**. Each response includes the following headers that your code should monitor:

| Header | Description |
| --- | --- |
| `X-RateLimit-Limit` | Maximum requests allowed per window (30) |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

If the limit is exceeded, implement exponential backoff before retrying.

---

## 3. Response Handling

All API responses are JSON. **Always check the `error` field first** before attempting to use any data. A value of `0` (or `false`) indicates success; any non-zero value indicates an error.

**Error response shape:**

```json
{
  "error": 1,
  "message": "An error occurred"
}
```

**Success responses** include an `error: 0` field alongside the relevant data payload. Never assume a request succeeded based solely on HTTP status code — always inspect the JSON body.

---

## 4. Links API Endpoints

This is the core of the integration. The following five operations are available for managing shortened links.

---

### 4.1 List Links

Retrieves a paginated list of all shortened links on the account.

**Endpoint:**
```
GET https://snazzy.fm/api/urls
```

**Query Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `limit` | No | Number of results per page |
| `page` | No | Page number to retrieve |
| `order` | No | Sort order: `date` or `click` |
| `short` | No | Search by short URL alias. When used, all other parameters are ignored. |
| `q` | No | Search for links by keyword |

**Example Request:**

```js
const response = await fetch(
  'https://snazzy.fm/api/urls?limit=10&page=1&order=date',
  { headers }
);
const data = await response.json();
```

**Success Response Shape:**

```json
{
  "error": "0",
  "data": {
    "result": 2,
    "perpage": 2,
    "currentpage": 1,
    "nextpage": 1,
    "maxpage": 1,
    "urls": [
      {
        "id": 2,
        "alias": "google",
        "shorturl": "https://snazzy.fm/google",
        "longurl": "https://google.com",
        "clicks": 0,
        "title": "Google",
        "description": "",
        "date": "2020-11-10 18:01:43"
      }
    ]
  }
}
```

---

### 4.2 Get a Single Link

Retrieves full details for one specific link by its numeric ID, including targeting rules, deep links, and analytics.

**Endpoint:**
```
GET https://snazzy.fm/api/url/:id
```

Replace `:id` with the integer ID of the link.

**Example Request:**

```js
const response = await fetch(
  `https://snazzy.fm/api/url/${linkId}`,
  { headers }
);
const data = await response.json();
```

**Success Response Shape:**

```json
{
  "error": 0,
  "id": 1,
  "details": {
    "id": 1,
    "shorturl": "https://snazzy.fm/googlecanada",
    "longurl": "https://google.com",
    "title": "Google",
    "description": "",
    "location": {
      "canada": "https://google.ca",
      "united states": "https://google.us"
    },
    "device": {
      "iphone": "https://google.com",
      "android": "https://google.com"
    },
    "expiry": null,
    "date": "2020-11-10 18:01:43"
  }
}
```

---

### 4.3 Shorten / Create a Link

This is the **primary endpoint** for creating a new shortened URL. Send a POST request with a JSON body.

**Endpoint:**
```
POST https://snazzy.fm/api/url/add
```

**Request Body Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `url` | **Yes** | The long URL to shorten |
| `custom` | No | Custom alias (e.g., `my-link`). A random alias is assigned if omitted. |
| `type` | No | Redirection type: `direct`, `frame`, or `splash`. Use `overlay-id` value for CTA pages. |
| `password` | No | Password-protect the link |
| `domain` | No | Custom branded domain ID (integer) |
| `expiry` | No | Expiration datetime, e.g., `2025-09-28 23:11:16` |
| `geotarget` | No | Array of geo-targeting rules (see example below) |
| `devicetarget` | No | Array of device-targeting rules |
| `languagetarget` | No | Array of language-targeting rules |
| `metatitle` | No | Custom Open Graph / meta title |
| `metadescription` | No | Custom meta description |
| `metaimage` | No | URL to a custom meta image (jpg or png) |
| `description` | No | Internal note or description |
| `pixels` | No | Array of pixel IDs to fire on click |
| `channel` | No | Channel ID to assign the link to |
| `campaign` | No | Campaign ID to assign the link to |
| `deeplink` | No | Object with `apple` and `google` app store URLs. Set `devicetarget` alongside this. |
| `status` | No | `public` or `private` (default: `private`) |

**Minimal Example Request (just shorten a URL):**

```js
const response = await fetch('https://snazzy.fm/api/url/add', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }),
});
const data = await response.json();
// data.shorturl contains the shortened URL
```

**Full-Featured Example Request:**

```js
const response = await fetch('https://snazzy.fm/api/url/add', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    url: 'https://google.com',
    custom: 'google',
    password: 'mypass',
    expiry: '2025-11-11 12:00:00',
    type: 'direct',
    metatitle: 'Not Google',
    metadescription: 'Not Google description',
    metaimage: 'https://example.com/image.png',
    description: 'For social sharing',
    pixels: [1, 2, 3, 4],
    channel: 1,
    campaign: 1,
    deeplink: {
      apple: 'https://apps.apple.com/us/app/google/id284815942',
      google: 'https://play.google.com/store/apps/details?id=com.google.android.googlequicksearchbox',
    },
    geotarget: [
      { location: 'Canada', link: 'https://google.ca' },
      { location: 'United States', link: 'https://google.us' },
    ],
    devicetarget: [
      { device: 'iPhone', link: 'https://google.com' },
      { device: 'Android', link: 'https://google.com' },
    ],
    languagetarget: [
      { language: 'en', link: 'https://google.com' },
      { language: 'fr', link: 'https://google.ca' },
    ],
    status: 'public',
  }),
});
const data = await response.json();
```

**Success Response Shape:**

```json
{
  "error": 0,
  "id": 3,
  "shorturl": "https://snazzy.fm/google"
}
```

The `shorturl` field is the final shortened URL to display or store.

---

### 4.4 Update a Link

Updates an existing link by its numeric ID. Accepts the same parameters as the Create endpoint (all optional on update, except `url` which is required).

**Endpoint:**
```
PUT https://snazzy.fm/api/url/:id/update
```

Replace `:id` with the integer ID of the link to update.

**Request Body Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `url` | **Yes** | New destination URL |
| `custom` | No | New custom alias |
| `type` | No | New redirection type |
| `password` | No | New or updated password |
| `domain` | No | New branded domain ID |
| `expiry` | No | New expiration datetime |
| `geotarget` | No | Updated geo-targeting rules |
| `devicetarget` | No | Updated device-targeting rules |
| `languagetarget` | No | Updated language-targeting rules |
| `metatitle` | No | Updated meta title |
| `metadescription` | No | Updated meta description |
| `metaimage` | No | Updated meta image URL |
| `pixels` | No | Updated array of pixel IDs |
| `channel` | No | Updated channel ID |
| `campaign` | No | Updated campaign ID |
| `deeplink` | No | Updated deep link object |

**Example Request:**

```js
const response = await fetch(`https://snazzy.fm/api/url/${linkId}/update`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    url: 'https://new-destination.com',
    custom: 'new-alias',
  }),
});
const data = await response.json();
```

**Success Response Shape:**

```json
{
  "error": 0,
  "id": 3,
  "short": "https://snazzy.fm/google"
}
```

---

### 4.5 Delete a Link

Permanently deletes a link by its numeric ID.

**Endpoint:**
```
DELETE https://snazzy.fm/api/url/:id/delete
```

Replace `:id` with the integer ID of the link to delete.

**Example Request:**

```js
const response = await fetch(`https://snazzy.fm/api/url/${linkId}/delete`, {
  method: 'DELETE',
  headers,
});
const data = await response.json();
```

**Success Response Shape:**

```json
{
  "error": 0,
  "message": "Link has been deleted successfully"
}
```

---

## 5. Implementation Checklist

Before shipping the integration, verify all of the following:

1. The API key is stored in an environment variable (e.g., `SNAZZY_API_KEY`) and is **never** exposed to the client/browser.
2. Every request includes both `Authorization: Bearer ...` and `Content-Type: application/json` headers.
3. Every response is checked for `error !== 0` before accessing data fields.
4. The `shorturl` field from the Create response is what gets stored and displayed — not a manually constructed URL.
5. Rate limit headers (`X-RateLimit-Remaining`) are monitored and the app handles `429` responses gracefully with retry logic.
6. Link IDs (integers) are persisted in the database so that Update and Delete operations can reference them later.
7. The `url` parameter in Create/Update is the **full long URL** including the `https://` protocol prefix.

---

## 6. Common Mistakes to Avoid

- **Do not** use the domain `snazzy.fm` as a base URL without the `/api` path prefix for API calls.
- **Do not** assume a `200 OK` HTTP status means the operation succeeded — always check `error` in the JSON body.
- **Do not** send the `url` parameter without the protocol (e.g., `google.com` will fail; use `https://google.com`).
- **Do not** expose the API key in frontend JavaScript bundles. All API calls must be proxied through your backend server.
- **Do not** omit `Content-Type: application/json` on POST and PUT requests — the server will not parse the body correctly without it.

---

## 7. Quick Reference: Endpoint Summary

| Operation | Method | Endpoint |
| --- | --- | --- |
| List all links | `GET` | `/api/urls` |
| Get a single link | `GET` | `/api/url/:id` |
| Create / shorten a link | `POST` | `/api/url/add` |
| Update a link | `PUT` | `/api/url/:id/update` |
| Delete a link | `DELETE` | `/api/url/:id/delete` |

---

*Documentation source: [https://snazzy.fm/developers](https://snazzy.fm/developers)*
