// routes/api/docs.js
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { hasRole } = require('../../middleware/auth');
const { version } = require('../../package.json');

const router = express.Router();

const spec = {
    openapi: '3.0.3',
    info: {
        title: 'OpReady API',
        description: 'REST API for OpReady — manages operational competency tracking, member notifications, skill verification forms, and training scheduling.',
        version,
        contact: { name: 'OpReady', url: 'https://github.com/dassige/OSM' }
    },
    servers: [{ url: '/', description: 'Current server' }],
    tags: [
        { name: 'Auth', description: 'Authentication and session management' },
        { name: 'Members', description: 'Volunteer member management' },
        { name: 'Skills', description: 'OSM skill management' },
        { name: 'Forms', description: 'Online verification form templates' },
        { name: 'Live Forms', description: 'Active form submission records' },
        { name: 'Surveys', description: 'Survey templates' },
        { name: 'Live Surveys', description: 'Active survey instances and responses' },
        { name: 'Training', description: 'In-person training session management' },
        { name: 'Reports', description: 'Compliance and verification reports' },
        { name: 'Statistics', description: 'Dashboard statistics' },
        { name: 'Users', description: 'Admin user account management' },
        { name: 'Profile', description: 'Current user profile and MFA' },
        { name: 'System', description: 'Health, preferences, and event logs' },
        { name: 'API Keys', description: 'API key management for external integrations' },
        { name: 'Knowledge Base', description: 'PDF document library — categories and documents with GUID-secured public viewer links' }
    ],
    components: {
        securitySchemes: {
            sessionCookie: {
                type: 'apiKey',
                in: 'cookie',
                name: 'connect.sid',
                description: 'Session cookie set after successful login'
            },
            xApiKey: {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-Key',
                description: 'API key in the format `osm_<64-hex-chars>`. Manage keys via System Admin → API Management.'
            }
        },
        schemas: {
            Success: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true } }
            },
            Error: {
                type: 'object',
                properties: { error: { type: 'string', example: 'An error occurred' } }
            },
            Member: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', example: 'Jane Smith' },
                    email: { type: 'string', format: 'email', nullable: true },
                    mobile: { type: 'string', example: '0211234567', nullable: true },
                    messengerId: { type: 'string', nullable: true },
                    notificationPreference: { type: 'string', enum: ['email', 'whatsapp', 'email,whatsapp', 'both', 'none'] },
                    enabled: { type: 'integer', enum: [0, 1] }
                }
            },
            MemberInput: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', example: 'Jane Smith', maxLength: 255 },
                    email: { type: 'string', format: 'email', nullable: true },
                    mobile: { type: 'string', example: '0211234567', nullable: true, maxLength: 30 },
                    messengerId: { type: 'string', nullable: true },
                    notificationPreference: { type: 'string', enum: ['email', 'whatsapp', 'email,whatsapp', 'both', 'none'], default: 'email' },
                    enabled: { type: 'integer', enum: [0, 1] }
                }
            },
            Skill: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', example: 'BA Renewal' },
                    url_type: { type: 'string', enum: ['internal', 'external', 'none'] },
                    url: { type: 'string', nullable: true },
                    critical_skill: { type: 'integer', enum: [0, 1] },
                    enabled: { type: 'integer', enum: [0, 1] }
                }
            },
            SkillInput: {
                type: 'object',
                required: ['name', 'url_type'],
                properties: {
                    name: { type: 'string', example: 'BA Renewal', maxLength: 255 },
                    url_type: { type: 'string', enum: ['internal', 'external', 'none'] },
                    url: { type: 'string', nullable: true },
                    critical_skill: { type: 'integer', enum: [0, 1] },
                    enabled: { type: 'integer', enum: [0, 1] }
                }
            },
            CsrfTokenResponse: {
                type: 'object',
                properties: {
                    token: { type: 'string', description: '64-character hex CSRF token. Include as `X-CSRF-Token` header on all mutating requests.', example: 'a3f8b1...' }
                }
            },
            Form: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    title: { type: 'string' },
                    skill_id: { type: 'integer' },
                    questions: { type: 'array', items: { type: 'object' } },
                    active: { type: 'integer', enum: [0, 1] }
                }
            },
            LiveForm: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    member_id: { type: 'integer' },
                    skill_id: { type: 'integer' },
                    form_id: { type: 'integer' },
                    form_status: { type: 'string', enum: ['pending', 'completed', 'expired'] },
                    created_at: { type: 'string', format: 'date-time' }
                }
            },
            User: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    role: { type: 'string', enum: ['superadmin', 'admin', 'simple'] },
                    mfa_enabled: { type: 'integer', enum: [0, 1] }
                }
            },
            TrainingSession: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    skill_id: { type: 'integer' },
                    session_date: { type: 'string', format: 'date' },
                    location: { type: 'string' },
                    notes: { type: 'string' },
                    member_ids: { type: 'array', items: { type: 'integer' } }
                }
            },
            HealthResponse: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['ok', 'error'] },
                    version: { type: 'string' },
                    uptime: { type: 'integer', description: 'Process uptime in seconds' },
                    db: { type: 'string', enum: ['ok', 'unreachable'] }
                }
            },
            PaginatedMembers: {
                type: 'object',
                properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/Member' } },
                    total: { type: 'integer', description: 'Total matching records' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' }
                }
            },
            PaginatedSkills: {
                type: 'object',
                properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/Skill' } },
                    total: { type: 'integer', description: 'Total matching records' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' }
                }
            },
            ReadyResponse: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['ready', 'starting', 'error'] },
                    db: { type: 'string', enum: ['ok'] },
                    whatsapp: {
                        oneOf: [
                            { type: 'string', enum: ['disabled'] },
                            {
                                type: 'object',
                                properties: {
                                    status: { type: 'string' },
                                    queueSize: { type: 'integer' }
                                }
                            }
                        ]
                    }
                }
            },
            Preference: {
                type: 'object',
                properties: {
                    key: { type: 'string', example: 'app_name' },
                    value: { type: 'string', example: 'OSM Manager' }
                }
            },
            EventLog: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    actor: { type: 'string' },
                    category: { type: 'string' },
                    title: { type: 'string' },
                    payload: { type: 'object' },
                    created_at: { type: 'string', format: 'date-time' }
                }
            },
            ApiKey: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', example: 'External Dashboard' },
                    key_prefix: { type: 'string', example: 'osm_a1b2c3d4' },
                    role: { type: 'string', enum: ['superadmin', 'admin', 'simple', 'guest'] },
                    created_by: { type: 'string' },
                    created_at: { type: 'string', format: 'date-time' },
                    last_used_at: { type: 'string', format: 'date-time', nullable: true },
                    active: { type: 'integer', enum: [0, 1] }
                }
            },
            ApiCallLogEntry: {
                type: 'object',
                properties: {
                    id:           { type: 'integer' },
                    api_key_id:   { type: 'integer', nullable: true },
                    key_name:     { type: 'string', example: 'External Dashboard' },
                    key_prefix:   { type: 'string', example: 'osm_a1b2c3d4' },
                    method:       { type: 'string', example: 'GET' },
                    endpoint:     { type: 'string', example: '/api/members?active=1&page=2' },
                    origin_ip:    { type: 'string', example: '203.0.113.42', nullable: true },
                    user_agent:   { type: 'string', nullable: true },
                    status_code:  { type: 'integer', example: 200, nullable: true },
                    path_params:  { type: 'string', format: 'json', nullable: true, description: 'JSON object of route path parameters, e.g. {"id":"42"} for /api/members/:id. Null when the route has no path parameters.' },
                    query_params: { type: 'string', format: 'json', nullable: true, description: 'JSON object of query-string parameters. Sensitive field values (password, token, etc.) are masked as "***".' },
                    request_body: { type: 'string', format: 'json', nullable: true, description: 'JSON-encoded request body. Sensitive field values are masked. Null for GET/HEAD requests or bodies with no parseable fields. Truncated to 2 KB.' },
                    logged_at:    { type: 'string', format: 'date-time' }
                }
            }
        }
    },
    security: [{ sessionCookie: [] }],
    paths: {

        // -------------------------------------------------------------------------
        // AUTH
        // -------------------------------------------------------------------------
        '/login': {
            post: {
                tags: ['Auth'],
                summary: 'Login',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'password'],
                                properties: {
                                    email: { type: 'string', format: 'email' },
                                    password: { type: 'string', format: 'password' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Authenticated or MFA required', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, mfaRequired: { type: 'boolean' } } } } } },
                    401: { description: 'Invalid credentials' }
                }
            }
        },
        '/login/mfa': {
            post: {
                tags: ['Auth'],
                summary: 'Complete MFA challenge',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['token'],
                                properties: { token: { type: 'string', example: '123456' } }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'MFA verified', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    401: { description: 'Invalid MFA token' }
                }
            }
        },
        '/forgot-password': {
            post: {
                tags: ['Auth'],
                summary: 'Request password reset email',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email'],
                                properties: { email: { type: 'string', format: 'email' } }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Reset email sent (if account exists)' }
                }
            }
        },
        '/logout': {
            get: {
                tags: ['Auth'],
                summary: 'Logout and destroy session',
                responses: {
                    302: { description: 'Redirected to /login' }
                }
            }
        },
        '/api/user-session': {
            get: {
                tags: ['Auth'],
                summary: 'Get current session user info',
                responses: {
                    200: {
                        description: 'Session user data',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        loggedIn: { type: 'boolean' },
                                        user: { $ref: '#/components/schemas/User' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },

        // -------------------------------------------------------------------------
        // MEMBERS
        // -------------------------------------------------------------------------
        '/api/members': {
            get: {
                tags: ['Members'],
                summary: 'List all members',
                description: 'Without `limit`: returns a plain array (backward-compatible). With `limit`: returns a paginated wrapper `{ items, total, limit, offset }`.',
                parameters: [
                    { name: 'limit',   in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Max records to return. Required to activate paginated mode.' },
                    { name: 'offset',  in: 'query', schema: { type: 'integer', minimum: 0, default: 0 }, description: 'Number of records to skip.' },
                    { name: 'search',  in: 'query', schema: { type: 'string' }, description: 'Case-insensitive substring filter on member name.' },
                    { name: 'sortBy',  in: 'query', schema: { type: 'string', enum: ['name','email','mobile','enabled','notificationPreference'], default: 'name' } },
                    { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc','desc'], default: 'asc' } }
                ],
                responses: {
                    200: {
                        description: 'Array of members (no `limit` param) or paginated result (with `limit`)',
                        content: { 'application/json': { schema: { oneOf: [
                            { type: 'array', items: { $ref: '#/components/schemas/Member' } },
                            { $ref: '#/components/schemas/PaginatedMembers' }
                        ] } } }
                    }
                }
            },
            post: {
                tags: ['Members'],
                summary: 'Create a member',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/MemberInput' } } }
                },
                responses: {
                    200: { description: 'New member ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/members/{id}': {
            put: {
                tags: ['Members'],
                summary: 'Update a member (all fields optional)',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/MemberInput' } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            },
            delete: {
                tags: ['Members'],
                summary: 'Delete a member',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    500: { description: 'Cannot delete — active dependencies', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/members/bulk-delete': {
            post: {
                tags: ['Members'],
                summary: 'Bulk delete members',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'integer' } } } } } }
                },
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/members/discover': {
            get: {
                tags: ['Members'],
                summary: 'Discover new members from the external OI data source',
                responses: {
                    200: { description: 'Array of new member names not yet in the database', content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } },
                    500: { description: 'Scrape error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/members/import': {
            post: {
                tags: ['Members'],
                summary: 'Bulk import members',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Member' } } } }
                },
                responses: {
                    200: { description: 'Imported', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // SKILLS
        // -------------------------------------------------------------------------
        '/api/skills': {
            get: {
                tags: ['Skills'],
                summary: 'List all skills',
                description: 'Without `limit`: returns a plain array (backward-compatible). With `limit`: returns a paginated wrapper `{ items, total, limit, offset }`.',
                parameters: [
                    { name: 'limit',   in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Max records to return. Required to activate paginated mode.' },
                    { name: 'offset',  in: 'query', schema: { type: 'integer', minimum: 0, default: 0 }, description: 'Number of records to skip.' },
                    { name: 'search',  in: 'query', schema: { type: 'string' }, description: 'Case-insensitive substring filter on skill name.' },
                    { name: 'sortBy',  in: 'query', schema: { type: 'string', enum: ['name','url_type','enabled','critical_skill'], default: 'name' } },
                    { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc','desc'], default: 'asc' } }
                ],
                responses: {
                    200: {
                        description: 'Array of skills (no `limit` param) or paginated result (with `limit`)',
                        content: { 'application/json': { schema: { oneOf: [
                            { type: 'array', items: { $ref: '#/components/schemas/Skill' } },
                            { $ref: '#/components/schemas/PaginatedSkills' }
                        ] } } }
                    }
                }
            },
            post: {
                tags: ['Skills'],
                summary: 'Create a skill',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/SkillInput' } } }
                },
                responses: {
                    200: { description: 'New skill ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/skills/{id}': {
            put: {
                tags: ['Skills'],
                summary: 'Update a skill (all fields optional)',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/SkillInput' } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            },
            delete: {
                tags: ['Skills'],
                summary: 'Delete a skill',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/skills/bulk-delete': {
            post: {
                tags: ['Skills'],
                summary: 'Bulk delete skills',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'integer' } } } } } }
                },
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/skills/discover': {
            get: {
                tags: ['Skills'],
                summary: 'Discover new skills from the external OI data source',
                responses: {
                    200: { description: 'Array of new skill names', content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } }
                }
            }
        },
        '/api/skills/import': {
            post: {
                tags: ['Skills'],
                summary: 'Bulk import skills',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Skill' } } } }
                },
                responses: {
                    200: { description: 'Imported', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // FORMS
        // -------------------------------------------------------------------------
        '/api/forms': {
            get: {
                tags: ['Forms'],
                summary: 'List all form templates',
                responses: {
                    200: { description: 'Array of forms', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Form' } } } } }
                }
            },
            post: {
                tags: ['Forms'],
                summary: 'Create a form template',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Form' } } }
                },
                responses: {
                    200: { description: 'New form ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } }
                }
            }
        },
        '/api/forms/{id}': {
            get: {
                tags: ['Forms'],
                summary: 'Get a form template',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Form detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Form' } } } }
                }
            },
            put: {
                tags: ['Forms'],
                summary: 'Update a form template',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Form' } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/forms/export/all': {
            get: {
                tags: ['Forms'],
                summary: 'Export all form templates as JSON',
                responses: {
                    200: { description: 'JSON file download', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Form' } } } } }
                }
            }
        },
        '/api/forms/import/all': {
            post: {
                tags: ['Forms'],
                summary: 'Import form templates from a JSON file',
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } }
                },
                responses: {
                    200: { description: 'Imported', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // LIVE FORMS
        // -------------------------------------------------------------------------
        '/api/live-forms': {
            get: {
                tags: ['Live Forms'],
                summary: 'List live form submissions',
                parameters: [
                    { name: 'member_id', in: 'query', schema: { type: 'integer' } },
                    { name: 'skill_id', in: 'query', schema: { type: 'integer' } },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'completed', 'expired'] } }
                ],
                responses: {
                    200: { description: 'Array of live forms', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/LiveForm' } } } } }
                }
            }
        },
        '/api/live-forms/export': {
            get: {
                tags: ['Live Forms'],
                summary: 'Export live form data as JSON',
                responses: {
                    200: { description: 'JSON file download' }
                }
            }
        },
        '/api/live-forms/all': {
            delete: {
                tags: ['Live Forms'],
                summary: 'Delete all live form records (superadmin)',
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/live-forms/{id}': {
            put: {
                tags: ['Live Forms'],
                summary: 'Update status or archive flag of a live form record',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    status:     { type: 'string', enum: ['sent', 'submitted', 'accepted', 'rejected', 'disabled'], description: 'New status value' },
                                    isArchived: { type: 'boolean' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Invalid status value' },
                    403: { description: 'Disabled in demo mode' },
                    409: { description: 'Cannot revert a terminal status (accepted / rejected) back to sent' }
                }
            }
        },
        '/api/live-forms/accept/{id}': {
            post: {
                tags: ['Live Forms'],
                summary: 'Accept a submitted form and optionally notify the member',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    notifyEmail:   { type: 'boolean' },
                                    notifyWa:      { type: 'boolean' },
                                    customComment: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Accepted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Disabled in demo mode' }
                }
            }
        },
        '/api/live-forms/reject/{id}': {
            post: {
                tags: ['Live Forms'],
                summary: 'Reject a submitted form and optionally notify the member',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    notifyEmail:   { type: 'boolean' },
                                    notifyWa:      { type: 'boolean' },
                                    customComment: { type: 'string' },
                                    generateNew:   { type: 'boolean', description: 'If true, archives this form and creates a new retry link' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Rejected', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Disabled in demo mode' }
                }
            }
        },

        // -------------------------------------------------------------------------
        // SURVEYS
        // -------------------------------------------------------------------------
        '/api/surveys/responses/{id}': {
            get: {
                tags: ['Surveys'],
                summary: 'Get a survey response by ID',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Survey response detail' }
                }
            }
        },
        '/api/surveys/instances/{liveId}/results': {
            get: {
                tags: ['Surveys'],
                summary: 'Get aggregated results for a live survey instance',
                parameters: [{ name: 'liveId', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Results and tracking data' }
                }
            }
        },

        // -------------------------------------------------------------------------
        // LIVE SURVEYS
        // -------------------------------------------------------------------------
        '/api/live-surveys/preview/{publicId}': {
            get: {
                tags: ['Live Surveys'],
                summary: 'Preview a survey template (admin)',
                parameters: [{ name: 'publicId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Survey template preview' }
                }
            }
        },
        '/api/live-surveys/{accessCode}': {
            get: {
                tags: ['Live Surveys'],
                summary: 'Fetch survey for a respondent (public)',
                security: [],
                parameters: [{ name: 'accessCode', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Survey questions' },
                    404: { description: 'Survey not found or expired' }
                }
            },
            post: {
                tags: ['Live Surveys'],
                summary: 'Submit survey response (public)',
                security: [],
                parameters: [{ name: 'accessCode', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', description: 'Map of question_id → answer', additionalProperties: true } } }
                },
                responses: {
                    200: { description: 'Submission recorded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // TRAINING SESSIONS
        // -------------------------------------------------------------------------
        '/api/training-sessions': {
            get: {
                tags: ['Training'],
                summary: 'List training sessions',
                parameters: [
                    { name: 'view', in: 'query', schema: { type: 'string', enum: ['future', 'all'] }, description: 'Filter to future sessions only' }
                ],
                responses: {
                    200: { description: 'Array of training sessions', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TrainingSession' } } } } }
                }
            },
            post: {
                tags: ['Training'],
                summary: 'Create a training session',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/TrainingSession' } } }
                },
                responses: {
                    200: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } }
                }
            }
        },
        '/api/training-sessions/{id}': {
            delete: {
                tags: ['Training'],
                summary: 'Delete a training session',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // REPORTS
        // -------------------------------------------------------------------------
        '/api/reports/data/{type}': {
            get: {
                tags: ['Reports'],
                summary: 'Get report data',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [
                    {
                        name: 'type',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string',
                            enum: ['by-member', 'by-skill', 'planned-sessions', 'critical-overdue', 'compliance-matrix', 'verification-history', 'training-attendance', 'survey-participation', 'survey-response-log']
                        }
                    }
                ],
                responses: {
                    200: { description: 'Report data array or object' },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role — admin or above required' }
                }
            }
        },
        '/api/reports/pdf': {
            post: {
                tags: ['Reports'],
                summary: 'Generate a PDF from HTML content',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['html'],
                                properties: { html: { type: 'string', description: 'HTML string to render as PDF' } }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role — admin or above required' }
                }
            }
        },

        // -------------------------------------------------------------------------
        // STATISTICS
        // -------------------------------------------------------------------------
        '/api/statistics/data/{key}': {
            get: {
                tags: ['Statistics'],
                summary: 'Get a statistics dataset',
                parameters: [
                    {
                        name: 'key',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', enum: ['compliance-overview'] }
                    }
                ],
                responses: {
                    200: { description: 'Statistics data' }
                }
            }
        },

        // -------------------------------------------------------------------------
        // USERS
        // -------------------------------------------------------------------------
        '/api/users': {
            get: {
                tags: ['Users'],
                summary: 'List all admin users',
                responses: {
                    200: { description: 'Array of users', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } }
                }
            },
            post: {
                tags: ['Users'],
                summary: 'Create an admin user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'email', 'password', 'role'],
                                properties: {
                                    name: { type: 'string' },
                                    email: { type: 'string', format: 'email' },
                                    password: { type: 'string', format: 'password' },
                                    role: { type: 'string', enum: ['superadmin', 'admin', 'simple'] }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Role elevation blocked — cannot create a user with a role higher than your own' },
                    429: { description: 'Rate limit exceeded — max 10 account creations per 15 minutes per IP' }
                }
            }
        },
        '/api/users/{id}': {
            put: {
                tags: ['Users'],
                summary: 'Update an admin user',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Role hierarchy violation — cannot modify a peer/superior or assign a role higher than your own' }
                }
            },
            delete: {
                tags: ['Users'],
                summary: 'Delete an admin user',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // PROFILE
        // -------------------------------------------------------------------------
        '/api/profile': {
            put: {
                tags: ['Profile'],
                summary: 'Update own profile (name, email, password)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    email: { type: 'string', format: 'email' },
                                    currentPassword: { type: 'string', format: 'password' },
                                    newPassword: { type: 'string', format: 'password' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/profile/mfa/setup': {
            post: {
                tags: ['Profile'],
                summary: 'Generate MFA secret and QR code (requires current password)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['currentPassword'],
                                properties: {
                                    currentPassword: { type: 'string', format: 'password', description: 'The user\'s current account password — required to initiate MFA setup' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'MFA setup data',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        secret: { type: 'string' },
                                        qrCode: { type: 'string', description: 'Base64 data URL of the QR code image' }
                                    }
                                }
                            }
                        }
                    },
                    400: { description: 'currentPassword missing' },
                    403: { description: 'Incorrect password or disabled in demo mode' }
                }
            }
        },
        '/api/profile/mfa/verify': {
            post: {
                tags: ['Profile'],
                summary: 'Verify TOTP token and enable MFA',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string', example: '123456' } } } } }
                },
                responses: {
                    200: { description: 'MFA enabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Invalid token' }
                }
            }
        },
        '/api/profile/mfa/disable': {
            post: {
                tags: ['Profile'],
                summary: 'Disable MFA for own account (requires valid TOTP code)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['totpToken'],
                                properties: {
                                    totpToken: { type: 'string', description: '6-digit authenticator code from the user\'s TOTP app — required to confirm MFA disable' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'MFA disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'totpToken missing or MFA not configured' },
                    403: { description: 'Invalid TOTP code or disabled in demo mode' }
                }
            }
        },
        '/api/profile/mfa/status': {
            get: {
                tags: ['Profile'],
                summary: 'Get own MFA status',
                responses: {
                    200: {
                        description: 'MFA status',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { enabled: { type: 'boolean' } }
                                }
                            }
                        }
                    }
                }
            }
        },

        // -------------------------------------------------------------------------
        // SYSTEM
        // -------------------------------------------------------------------------
        '/api/csrf-token': {
            get: {
                tags: ['System'],
                summary: 'Get a CSRF token for the current session',
                description: 'Returns a 64-character hex token tied to the current session. Include it as the `X-CSRF-Token` header on all POST, PUT, PATCH, and DELETE requests made by a logged-in user. The `utils.js` fetch interceptor on authenticated pages handles this automatically.',
                security: [{ sessionCookie: [] }],
                responses: {
                    200: { description: 'CSRF token', content: { 'application/json': { schema: { $ref: '#/components/schemas/CsrfTokenResponse' } } } }
                }
            }
        },
        '/api/health': {
            get: {
                tags: ['System'],
                summary: 'Health check — DB connectivity and uptime',
                security: [],
                responses: {
                    200: { description: 'Healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } },
                    503: { description: 'DB unreachable', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } }
                }
            }
        },
        '/api/ready': {
            get: {
                tags: ['System'],
                summary: 'Readiness probe — DB + WhatsApp client state',
                description: 'Returns 200 when the server is fully ready to serve traffic. Returns 503 while the WhatsApp client (if enabled) is still initialising. Safe to use as a Kubernetes/Docker readiness probe.',
                security: [],
                responses: {
                    200: { description: 'Ready', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadyResponse' } } } },
                    503: { description: 'Not yet ready or DB unreachable', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadyResponse' } } } }
                }
            }
        },
        '/api/preferences': {
            get: {
                tags: ['System'],
                summary: 'Get all system preferences',
                responses: {
                    200: { description: 'Preferences map', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
                    403: { description: 'Admin role required' }
                }
            },
            post: {
                tags: ['System'],
                summary: 'Save a system preference (admin)',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Preference' } } }
                },
                responses: {
                    200: { description: 'Saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/user-preferences': {
            get: {
                tags: ['System'],
                summary: 'Get all preferences for the current user',
                responses: {
                    200: { description: 'User preferences map', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }
                }
            },
            post: {
                tags: ['System'],
                summary: 'Save a user preference',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Preference' } } }
                },
                responses: {
                    200: { description: 'Saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/user-preferences/{key}': {
            get: {
                tags: ['System'],
                summary: 'Get a single user preference by key',
                parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Preference value', content: { 'application/json': { schema: { type: 'object', properties: { value: {} } } } } }
                }
            }
        },
        '/api/events': {
            get: {
                tags: ['System'],
                summary: 'Get event logs (admin)',
                parameters: [
                    { name: 'category', in: 'query', schema: { type: 'string' } },
                    { name: 'actor', in: 'query', schema: { type: 'string' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
                ],
                responses: {
                    200: { description: 'Paginated event logs', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/EventLog' } } } } }
                }
            }
        },
        '/api/events/meta': {
            get: {
                tags: ['System'],
                summary: 'Get event log metadata (admin)',
                responses: {
                    200: { description: 'Distinct categories and actors' }
                }
            }
        },
        '/api/events/export': {
            get: {
                tags: ['System'],
                summary: 'Export event logs as JSON download (admin)',
                responses: {
                    200: { description: 'JSON file download' }
                }
            }
        },
        '/api/events/all': {
            delete: {
                tags: ['System'],
                summary: 'Purge all event logs (superadmin)',
                responses: {
                    200: { description: 'Purged', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/events/prune': {
            post: {
                tags: ['System'],
                summary: 'Prune event logs older than N days (superadmin)',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { days: { type: 'integer', example: 90 } } } } }
                },
                responses: {
                    200: { description: 'Pruned', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/system/backup': {
            get: {
                tags: ['System'],
                summary: 'Download SQL backup (superadmin)',
                description: 'Generates a full SQL dump of the database and returns it as a downloadable `.sql` file. Callable externally with an API key — suitable for automated backup scripts (cron, Cloud Scheduler, etc.) that wake a Cloud Run instance on demand.',
                responses: {
                    200: {
                        description: 'SQL dump file download',
                        content: { 'text/plain': { schema: { type: 'string', format: 'binary' } } },
                        headers: {
                            'Content-Disposition': { schema: { type: 'string', example: 'attachment; filename="fenz_backup_2025-01-15.sql"' } }
                        }
                    },
                    403: { description: 'Insufficient role' },
                    429: { description: 'Rate limit exceeded — max 10 backups per hour' }
                }
            }
        },
        '/api/system/restore': {
            post: {
                tags: ['System'],
                summary: 'Restore from SQL backup (superadmin)',
                description: 'Uploads a `.sql` dump file and fully replaces the database. All active sessions are invalidated after restore. Disabled in demo mode. Irreversible.',
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['databaseFile'],
                                properties: {
                                    databaseFile: { type: 'string', format: 'binary', description: 'SQL dump file (.sql) to restore from' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Restored', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'No file provided or invalid SQL' },
                    403: { description: 'Insufficient role or demo mode' },
                    429: { description: 'Rate limit exceeded — max 3 restores per hour' },
                    500: { description: 'Restore failed' }
                }
            }
        },
        '/api/system/ai-test': {
            post: {
                tags: ['System'],
                summary: 'Run a one-off AI evaluation test (superadmin)',
                description: 'Submits a question/rubric/answer triple to the configured AI provider and returns the score and justification. Used to verify AI scoring configuration before enabling it for live forms. Rate-limited to 10 requests per minute.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['question', 'reference', 'answer', 'maxPoints', 'configOverride'],
                                properties: {
                                    question:       { type: 'string', description: 'The question text' },
                                    reference:      { type: 'string', description: 'The rubric / reference answer' },
                                    answer:         { type: 'string', description: 'The candidate answer to evaluate' },
                                    maxPoints:      { type: 'number', description: 'Maximum score for this question' },
                                    configOverride: {
                                        type: 'object',
                                        description: 'AI provider settings to use for this test',
                                        properties: {
                                            provider:  { type: 'string', enum: ['gemini', 'ollama'] },
                                            geminiKey: { type: 'string', description: 'Pass "USE_SERVER_DEFAULT" to use the server key' },
                                            ollamaUrl: { type: 'string' },
                                            model:     { type: 'string' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Evaluation result',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success:       { type: 'boolean' },
                                        score:         { type: 'number' },
                                        justification: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    400: { description: 'Invalid Ollama URL — when provider is ollama and ollamaUrl is a blocked/private address' },
                    429: { description: 'Rate limit exceeded — max 10 AI tests per minute' },
                    500: { description: 'AI provider error — message included in response body; stack trace is server-side only' }
                }
            }
        },
        // -------------------------------------------------------------------------
        // DIRECTORY BROWSER
        // -------------------------------------------------------------------------
        '/api/system/browse-directory': {
            get: {
                operationId: 'browseDirectory',
                tags: ['System'],
                summary: 'List subdirectories at a server path (superadmin)',
                description: 'Returns the immediate child directories of the given path. Used by the Backup & Restore UI to let an admin navigate the server filesystem when selecting a backup save location.',
                security: [{ sessionCookie: [] }, { apiKey: [] }],
                parameters: [
                    { name: 'path', in: 'query', required: false, schema: { type: 'string', default: '/' }, description: 'Absolute server path to list. Defaults to the filesystem root.' }
                ],
                responses: {
                    200: {
                        description: 'Directory listing',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        path:    { type: 'string', example: '/backups' },
                                        parent:  { type: 'string', nullable: true, example: '/' },
                                        entries: { type: 'array', items: { type: 'string' }, example: ['opready', 'logs'] }
                                    }
                                }
                            }
                        }
                    },
                    400: { description: 'Path does not exist or cannot be read' },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role' }
                }
            }
        },
        // -------------------------------------------------------------------------
        // REMOTE BACKUP
        // -------------------------------------------------------------------------
        '/api/system/remote-backup': {
            get: {
                operationId: 'listRemoteBackupServers',
                tags: ['System'],
                summary: 'List remote backup servers (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: {
                    200: { description: 'Array of remote server configurations', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role' }
                }
            },
            post: {
                operationId: 'addRemoteBackupServer',
                tags: ['System'],
                summary: 'Add a remote backup server (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'url', 'apiKey'],
                                properties: {
                                    name:           { type: 'string', example: 'Production Server' },
                                    url:            { type: 'string', example: 'https://remote.example.com' },
                                    apiKey:         { type: 'string', description: 'API key for the remote OpReady instance' },
                                    backupType:     { type: 'string', enum: ['db', 'full'], example: 'db' },
                                    backupLocation: { type: 'string', example: '/backups/remote' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Server added', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    400: { description: 'Validation error' },
                    403: { description: 'Insufficient role or max server limit reached' }
                }
            }
        },
        '/api/system/remote-backup/test-inline': {
            post: {
                operationId: 'testRemoteBackupInline',
                tags: ['System'],
                summary: 'Test connection with inline credentials (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['url', 'apiKey'],
                                properties: {
                                    url:    { type: 'string', example: 'https://remote.example.com' },
                                    apiKey: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Connection test result with remote version and uptime' },
                    400: { description: 'Connection failed' },
                    403: { description: 'Insufficient role' }
                }
            }
        },
        '/api/system/remote-backup/{id}': {
            put: {
                operationId: 'updateRemoteBackupServer',
                tags: ['System'],
                summary: 'Update a remote backup server (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' }, apiKey: { type: 'string', nullable: true, description: 'Omit or null to keep existing key' }, backupType: { type: 'string', enum: ['db', 'full'] }, backupLocation: { type: 'string' } } } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Insufficient role' },
                    404: { description: 'Server not found' }
                }
            },
            delete: {
                operationId: 'deleteRemoteBackupServer',
                tags: ['System'],
                summary: 'Delete a remote backup server (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Insufficient role' },
                    404: { description: 'Server not found' }
                }
            }
        },
        '/api/system/remote-backup/{id}/test': {
            post: {
                operationId: 'testRemoteBackupServer',
                tags: ['System'],
                summary: 'Test connection for a saved remote server (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Connection test result with remote version and uptime' },
                    400: { description: 'Connection failed' },
                    403: { description: 'Insufficient role' },
                    404: { description: 'Server not found' }
                }
            }
        },
        '/api/system/remote-backup/{id}/run-now': {
            post: {
                operationId: 'runRemoteBackupNow',
                tags: ['System'],
                summary: 'Pull a backup from a remote server immediately (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: false,
                    content: { 'application/json': { schema: { type: 'object', properties: { backupType: { type: 'string', enum: ['db', 'full'] } } } } }
                },
                responses: {
                    200: { description: 'Pull complete — returns filename and file size', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, filename: { type: 'string' }, size: { type: 'integer' } } } } } },
                    403: { description: 'Insufficient role or demo mode' },
                    404: { description: 'Server not found' },
                    500: { description: 'Pull failed' }
                }
            }
        },
        '/api/system/remote-backup/{id}/schedule': {
            post: {
                operationId: 'saveRemoteBackupSchedule',
                tags: ['System'],
                summary: 'Save the pull schedule for a remote server (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object', required: ['enabled'],
                                properties: {
                                    enabled:        { type: 'boolean' },
                                    scheduleType:   { type: 'string', enum: ['daily', 'weekly', 'every_n_hours', 'every_n_days'] },
                                    scheduleTime:   { type: 'string', example: '03:00' },
                                    scheduleDays:   { type: 'string', example: '[1]', description: 'JSON array of day numbers (0=Sun … 6=Sat)' },
                                    intervalValue:  { type: 'integer', example: 6 },
                                    backupType:     { type: 'string', enum: ['db', 'full'] },
                                    backupLocation: { type: 'string', example: '/app/backups/remote/prod', description: 'Absolute path on the local server where pulled files are saved. Defaults to /app/backups/remote/<server-name> if blank.' },
                                    retentionType:  { type: 'string', enum: ['count', 'days', 'none'] },
                                    retentionValue: { type: 'integer', example: 10 }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Schedule saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Insufficient role or demo mode' },
                    404: { description: 'Server not found' }
                }
            }
        },
        '/api/system/remote-backup/{id}/history': {
            get: {
                operationId: 'getRemoteBackupHistory',
                tags: ['System'],
                summary: 'Get pull history for a remote server (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Array of pull history entries', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
                    403: { description: 'Insufficient role' },
                    404: { description: 'Server not found' }
                }
            },
            delete: {
                operationId: 'clearRemoteBackupHistory',
                tags: ['System'],
                summary: 'Clear pull history for a remote server (superadmin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'History cleared', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Insufficient role' },
                    404: { description: 'Server not found' }
                }
            }
        },
        // -------------------------------------------------------------------------
        // SCHEDULED BACKUP
        // -------------------------------------------------------------------------
        '/api/system/scheduled-backup': {
            get: {
                operationId: 'getScheduledBackupConfig',
                tags: ['System'],
                summary: 'Get scheduled backup configuration and history (superadmin)',
                security: [{ sessionCookie: [] }, { apiKey: [] }],
                responses: {
                    200: {
                        description: 'Scheduled backup configuration and last 20 history entries',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        config: {
                                            type: 'object',
                                            properties: {
                                                enabled:         { type: 'boolean' },
                                                backup_type:     { type: 'string', enum: ['db', 'full'] },
                                                schedule_type:   { type: 'string', enum: ['daily', 'weekly', 'every_n_hours', 'every_n_days'] },
                                                schedule_time:   { type: 'string', example: '02:00' },
                                                schedule_days:   { type: 'string', example: '[1]' },
                                                interval_value:  { type: 'integer' },
                                                backup_location: { type: 'string' },
                                                retention_type:  { type: 'string', enum: ['count', 'days', 'none'] },
                                                retention_value: { type: 'integer' },
                                                last_run_at:     { type: 'string', format: 'date-time', nullable: true },
                                                next_run_at:     { type: 'string', format: 'date-time', nullable: true }
                                            }
                                        },
                                        history: { type: 'array', items: { type: 'object' } }
                                    }
                                }
                            }
                        }
                    },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role' }
                }
            },
            post: {
                operationId: 'saveScheduledBackupConfig',
                tags: ['System'],
                summary: 'Save scheduled backup configuration (superadmin)',
                description: 'Saves configuration and immediately restarts the scheduler. Disabled in demo mode and on ephemeral deployments (Cloud Run, App Runner, Fargate).',
                security: [{ sessionCookie: [] }, { apiKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['enabled'],
                                properties: {
                                    enabled:        { type: 'boolean' },
                                    scheduleType:   { type: 'string', enum: ['daily', 'weekly', 'every_n_hours', 'every_n_days'] },
                                    scheduleTime:   { type: 'string', example: '02:00' },
                                    scheduleDays:   { type: 'string', example: '[1]', description: 'JSON array of day numbers (0=Sun … 6=Sat)' },
                                    intervalValue:  { type: 'integer', example: 6 },
                                    backupType:     { type: 'string', enum: ['db', 'full'] },
                                    backupLocation: { type: 'string', example: '/backups/opready' },
                                    retentionType:  { type: 'string', enum: ['count', 'days', 'none'] },
                                    retentionValue: { type: 'integer', example: 10 }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Configuration saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Demo mode or ephemeral deployment' },
                    500: { description: 'Save failed' }
                }
            }
        },
        '/api/system/scheduled-backup/run-now': {
            post: {
                operationId: 'runScheduledBackupNow',
                tags: ['System'],
                summary: 'Trigger scheduled backup immediately (superadmin)',
                description: 'Runs the backup synchronously using the saved configuration. Returns after the backup and retention cleanup complete.',
                security: [{ sessionCookie: [] }, { apiKey: [] }],
                responses: {
                    200: { description: 'Backup completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Demo mode or ephemeral deployment' },
                    500: { description: 'Backup failed' }
                }
            }
        },
        '/api/system/scheduled-backup/history': {
            delete: {
                operationId: 'clearScheduledBackupHistory',
                tags: ['System'],
                summary: 'Clear scheduled backup history (superadmin)',
                security: [{ sessionCookie: [] }, { apiKey: [] }],
                responses: {
                    200: { description: 'History cleared', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Demo mode or insufficient role' },
                    500: { description: 'Server error' }
                }
            }
        },
        // -------------------------------------------------------------------------
        // API KEYS
        // -------------------------------------------------------------------------
        '/api/api-keys': {
            get: {
                tags: ['API Keys'],
                summary: 'List all API keys (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: {
                    200: {
                        description: 'Array of API key records (full key value is never returned)',
                        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } } } }
                    }
                }
            },
            post: {
                tags: ['API Keys'],
                summary: 'Create a new API key (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'role'],
                                properties: {
                                    name: { type: 'string', example: 'External Dashboard' },
                                    role: { type: 'string', enum: ['superadmin', 'admin', 'simple', 'guest'], example: 'admin' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Key created — full key returned once only',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean', example: true },
                                        key: { type: 'string', example: 'osm_a1b2c3d4...' },
                                        prefix: { type: 'string', example: 'osm_a1b2c3d4' }
                                    }
                                }
                            }
                        }
                    },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Role elevation blocked — cannot create a key with a role higher than your own' }
                }
            }
        },
        '/api/api-keys/{id}/toggle': {
            patch: {
                tags: ['API Keys'],
                summary: 'Toggle (revoke / enable) an API key (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Toggled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/api-keys/{id}': {
            delete: {
                tags: ['API Keys'],
                summary: 'Delete an API key permanently (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/api-keys/call-log/export': {
            get: {
                tags: ['API Keys'],
                summary: 'Export all matching call log entries as JSON (admin)',
                description: 'Returns all records matching the filters without pagination. The response includes a Content-Disposition header suggesting a filename for download.',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [
                    { name: 'sort',      in: 'query', schema: { type: 'string', enum: ['logged_at','key_name','method','endpoint','origin_ip','status_code'], default: 'logged_at' }, description: 'Column to sort by' },
                    { name: 'sortDir',   in: 'query', schema: { type: 'string', enum: ['asc','desc'], default: 'desc' }, description: 'Sort direction' },
                    { name: 'keyId',     in: 'query', schema: { type: 'integer' }, description: 'Filter by api_key_id' },
                    { name: 'method',    in: 'query', schema: { type: 'string', enum: ['GET','POST','PUT','PATCH','DELETE'] }, description: 'Filter by HTTP method' },
                    { name: 'endpoint',  in: 'query', schema: { type: 'string' }, description: 'Partial match on endpoint URL' },
                    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter entries logged on or after this datetime' },
                    { name: 'endDate',   in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter entries logged on or before this datetime' }
                ],
                responses: {
                    200: {
                        description: 'Full export (no pagination)',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        exportedAt: { type: 'string', format: 'date-time', example: '2026-06-06T10:30:00.000Z' },
                                        count:   { type: 'integer', example: 42 },
                                        records: { type: 'array', items: { $ref: '#/components/schemas/ApiCallLogEntry' } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },

        '/api/api-keys/call-log': {
            get: {
                tags: ['API Keys'],
                summary: 'List API call log entries (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [
                    { name: 'page',      in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
                    { name: 'limit',     in: 'query', schema: { type: 'integer', default: 50, maximum: 500 }, description: 'Rows per page' },
                    { name: 'sort',      in: 'query', schema: { type: 'string', enum: ['logged_at','key_name','method','endpoint','origin_ip','status_code'], default: 'logged_at' }, description: 'Column to sort by' },
                    { name: 'sortDir',   in: 'query', schema: { type: 'string', enum: ['asc','desc'], default: 'desc' }, description: 'Sort direction' },
                    { name: 'keyId',     in: 'query', schema: { type: 'integer' }, description: 'Filter by api_key_id' },
                    { name: 'method',    in: 'query', schema: { type: 'string', enum: ['GET','POST','PUT','PATCH','DELETE'] }, description: 'Filter by HTTP method' },
                    { name: 'endpoint',  in: 'query', schema: { type: 'string' }, description: 'Partial match on endpoint URL (includes query string)' },
                    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter entries logged on or after this datetime' },
                    { name: 'endDate',   in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter entries logged on or before this datetime' }
                ],
                responses: {
                    200: {
                        description: 'Paginated call log',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        rows:  { type: 'array', items: { $ref: '#/components/schemas/ApiCallLogEntry' } },
                                        total: { type: 'integer', example: 142 }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            delete: {
                tags: ['API Keys'],
                summary: 'Purge call log entries older than N days (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [
                    { name: 'days', in: 'query', required: true, schema: { type: 'integer', example: 90 }, description: 'Delete entries older than this many days' }
                ],
                responses: {
                    200: {
                        description: 'Purge result',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success:      { type: 'boolean', example: true },
                                        deletedCount: { type: 'integer', example: 312 }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },

        '/api/logs': {
            post: {
                tags: ['System'],
                summary: 'Write a custom event log entry (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['type', 'title'],
                                properties: {
                                    type: { type: 'string' },
                                    title: { type: 'string' },
                                    payload: { type: 'object' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Logged', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Admin role required, or category is restricted (Security, System, User Mgmt, API Keys, WhatsApp)' }
                }
            }
        },

        // ── Knowledge Base ────────────────────────────────────────────────────
        '/api/knowledgebase/categories': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'List all categories',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: { 200: { description: 'Array of category objects' } }
            },
            post: {
                tags: ['Knowledge Base'],
                summary: 'Create a category',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: {
                        type: 'object',
                        required: ['name'],
                        properties: {
                            name: { type: 'string', example: 'Operational' },
                            parent_id: { type: 'integer', nullable: true },
                            sort_order: { type: 'integer', default: 0 }
                        }
                    }}}
                },
                responses: {
                    200: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/knowledgebase/categories/{id}': {
            patch: {
                tags: ['Knowledge Base'],
                summary: 'Update a category',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, parent_id: { type: 'integer', nullable: true }, sort_order: { type: 'integer' } } } } } },
                responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } }
            },
            delete: {
                tags: ['Knowledge Base'],
                summary: 'Delete a category (children re-parented; documents become uncategorized)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } }
            }
        },
        '/api/knowledgebase/documents': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'List documents (optionally filtered by category_id)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'category_id', in: 'query', schema: { type: 'integer' }, description: 'Omit for all documents; pass null for uncategorized' }],
                responses: { 200: { description: 'Array of document objects' } }
            },
            post: {
                tags: ['Knowledge Base'],
                summary: 'Upload a PDF document',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: {
                        type: 'object',
                        required: ['file', 'title'],
                        properties: {
                            file: { type: 'string', format: 'binary', description: 'Document file — PDF, Word, Excel or RTF (max 50 MB)' },
                            title: { type: 'string', example: 'Fire Attack Procedures' },
                            description: { type: 'string', nullable: true },
                            category_id: { type: 'integer', nullable: true },
                            expires_at: { type: 'string', format: 'date', nullable: true, example: '2027-06-04', description: 'ISO date after which the document is flagged as expired' }
                        }
                    }}}
                },
                responses: {
                    200: { description: 'Uploaded', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, slug: { type: 'string', example: '4A04912E-F5C3-4CA6-91FC-8CBB3527AD81' } } } } } },
                    507: { description: 'Insufficient server disk space — free space below 100 MB (local storage only)' }
                }
            }
        },
        '/api/knowledgebase/documents/missing-files': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'Scan all documents for missing storage files',
                description: 'Checks every document record against the configured storage backend and returns those whose physical file is absent. Useful after a DB-only restore or a storage migration.',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: {
                    200: {
                        description: 'Scan result',
                        content: { 'application/json': { schema: {
                            type: 'object',
                            properties: {
                                total:   { type: 'integer', description: 'Total documents scanned', example: 15 },
                                missing: {
                                    type: 'array',
                                    description: 'Documents whose file was not found in storage',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            id:                { type: 'integer' },
                                            title:             { type: 'string' },
                                            original_filename: { type: 'string' },
                                            storage_type:      { type: 'string', enum: ['local', 's3', 'gcs'] },
                                            category_name:     { type: 'string', nullable: true },
                                            is_active:         { type: 'integer', enum: [0, 1] },
                                            created_at:        { type: 'string', format: 'date-time' }
                                        }
                                    }
                                }
                            }
                        }}}
                    }
                }
            }
        },
        '/api/knowledgebase/documents/{id}': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'Get a single document by ID',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Document object' }, 404: { description: 'Not found' } }
            },
            patch: {
                tags: ['Knowledge Base'],
                summary: 'Update document title, description, or category',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string', nullable: true }, category_id: { type: 'integer', nullable: true }, expires_at: { type: 'string', format: 'date', nullable: true, description: 'ISO date after which the document is flagged as expired' } } } } } },
                responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } }
            },
            delete: {
                tags: ['Knowledge Base'],
                summary: 'Delete a document and its stored file',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } }
            }
        },
        '/api/knowledgebase/documents/{id}/file-status': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'Check whether the stored file exists in the configured storage backend',
                description: 'Returns { exists: true } when the physical file is present, { exists: false } when it is missing (e.g. storage deleted, DB-only restore). The metadata record is always preserved.',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'File status', content: { 'application/json': { schema: { type: 'object', properties: { exists: { type: 'boolean', example: true } } } } } },
                    404: { description: 'Document not found' }
                }
            }
        },
        '/api/knowledgebase/documents/{id}/toggle': {
            patch: {
                tags: ['Knowledge Base'],
                summary: 'Toggle document active/inactive',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Toggled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } }
            }
        },
        '/api/knowledgebase/documents/{id}/replace-file': {
            post: {
                tags: ['Knowledge Base'],
                summary: 'Replace the stored file — same id, slug and storage path; only the bytes change',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: {
                        type: 'object',
                        required: ['file'],
                        properties: {
                            file: { type: 'string', format: 'binary', description: 'Replacement file — PDF, Word, Excel or RTF (max 50 MB)' }
                        }
                    }}}
                },
                responses: {
                    200: { description: 'File replaced', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'No file provided' },
                    404: { description: 'Document not found' },
                    507: { description: 'Insufficient server disk space — free space below 100 MB (local storage only)' }
                }
            }
        },
        '/api/knowledgebase/documents/{id}/rotate-slug': {
            patch: {
                tags: ['Knowledge Base'],
                summary: 'Rotate the public slug for a single document — invalidates its current public link only',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Slug rotated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, slug: { type: 'string', example: 'NEW-UUID-HERE' } } } } } },
                    404: { description: 'Document not found' }
                }
            }
        },
        '/api/knowledgebase/rotate-slugs': {
            post: {
                tags: ['Knowledge Base'],
                summary: 'Rotate all document slugs — invalidates every existing public link (superadmin only)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: {
                    200: { description: 'Rotation complete', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, rotated: { type: 'integer', example: 12 } } } } } },
                    403: { description: 'Forbidden or demo mode' }
                }
            }
        },
        '/api/knowledgebase/doc/{slug}': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'Get public document metadata by GUID slug (no auth required)',
                parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' }, example: '4A04912E-F5C3-4CA6-91FC-8CBB3527AD81' }],
                responses: { 200: { description: 'Document metadata' }, 404: { description: 'Not found or inactive' } }
            }
        },
        '/api/knowledgebase/file/{slug}': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'Serve the PDF file by GUID slug (no auth required — GUID is the access control)',
                parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'PDF binary stream', content: { 'application/pdf': {} } },
                    404: { description: 'Not found or inactive' }
                }
            }
        }
    }
};

router.use('/', hasRole('admin'), swaggerUi.serve);
router.get('/', hasRole('admin'), swaggerUi.setup(spec, {
    customSiteTitle: 'OpReady API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: { persistAuthorization: true }
}));

router.get('/spec.json', hasRole('admin'), (req, res) => {
    res.json(spec);
});

module.exports = router;
