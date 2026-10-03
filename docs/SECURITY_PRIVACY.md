# Security and Privacy

## Trust model

The Vinyl Drop is a community marketplace for physical goods.

The application therefore handles:
- user identities;
- public profiles;
- private authentication data through an auth provider;
- private messages in future phases;
- user-uploaded images;
- marketplace content.

Security is a product requirement from the first implementation phase.

## Authentication

Use Supabase Auth for user authentication.

Application profile records reference the authenticated user identity.

Rules:
- passwords are never handled by custom application code if Supabase Auth can own the flow;
- session validation happens before protected actions;
- public pages must not accidentally expose session or auth metadata.

## Authorization

Authentication answers "who are you?"

Authorization answers "may you perform this action?"

Ownership checks must happen server-side.

Examples:
- only a listing owner can edit or publish their listing;
- only authorized users can mutate their own profile;
- only authorized users can mutate their own listing photos;
- comments require authenticated authors;
- future private messages must never be accessible through public listing queries.

Do not rely on hidden buttons or EJS conditionals as authorization.

## Database security

When using Supabase access patterns that rely on direct client data access, Row Level Security policies must enforce authorization.

The server-side application should still keep a clear ownership/service boundary.

## Input security

All untrusted input is validated.

Threats to address:
- XSS through profile/listing/comment text;
- SQL injection through query construction;
- unsafe file uploads;
- path traversal;
- request forgery;
- authorization bypass;
- mass assignment.

Never concatenate SQL from user input.

Never trust client-submitted ownership fields.

## HTML safety

EJS templates must escape untrusted values by default.

Any future explicit HTML rendering must be separately reviewed and sanitized.

Comments and descriptions are plain text in the MVP.

## Image uploads

Images require:
- MIME/type validation;
- size limits;
- dimensions where appropriate;
- server-side ownership checks;
- generated storage paths;
- safe transformations before public delivery;
- no execution of uploaded files.

Sharp is the planned image-processing boundary.

## Privacy

Public:
- username/display name;
- avatar;
- bio;
- coarse location;
- public listings;
- public comments.

Private:
- email;
- auth/session data;
- private messages;
- internal moderation notes;
- precise location/contact data unless explicitly required later.

Never publish a user's home address.

## Moderation

MVP moderation should at minimum have a documented path for:
- reporting abusive content;
- hiding/deleting inappropriate comments;
- removing fraudulent listings;
- dealing with malicious uploads.

A full moderation dashboard is not required before basic reporting exists.

## Abuse controls

As the community grows, add:
- rate limiting;
- upload limits;
- comment throttling;
- login abuse protection;
- report rate limits.

Do not build heavy anti-abuse infrastructure before a concrete threat model requires it.

## Data retention

Keep marketplace history useful without retaining unnecessary personal data indefinitely.

Privacy/deletion flows must distinguish:
- identity deletion;
- public marketplace history;
- moderation/audit requirements.

This policy must be implemented deliberately; it should not emerge accidentally from database cascade rules.

## Secrets

Never commit:
- Supabase service-role keys;
- database passwords;
- API keys;
- session secrets.

All production secrets belong in GitHub/Supabase deployment secret storage.

Public browser keys are not equivalent to service-role credentials and must still be handled according to Supabase's security model.

## Security review gates

Security-sensitive PRs must explicitly document:
- authentication impact;
- authorization path;
- data exposure;
- upload handling;
- migrations;
- tests covering the changed permission boundary.
