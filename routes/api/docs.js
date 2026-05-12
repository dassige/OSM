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
        { name: 'System', description: 'Health, preferences, and event logs' }
    ],
    components: {
        securitySchemes: {
            sessionCookie: {
                type: 'apiKey',
                in: 'cookie',
                name: 'connect.sid',
                description: 'Session cookie set after successful login'
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
                    email: { type: 'string', format: 'email' },
                    mobile: { type: 'string', example: '0211234567' },
                    station: { type: 'string' },
                    active: { type: 'integer', enum: [0, 1] }
                }
            },
            Skill: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', example: 'BA Renewal' },
                    code: { type: 'string' },
                    expiry_months: { type: 'integer', example: 12 },
                    active: { type: 'integer', enum: [0, 1] }
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
                responses: {
                    200: { description: 'Array of members', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Member' } } } } }
                }
            },
            post: {
                tags: ['Members'],
                summary: 'Create a member',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Member' } } }
                },
                responses: {
                    200: { description: 'New member ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } }
                }
            }
        },
        '/api/members/{id}': {
            put: {
                tags: ['Members'],
                summary: 'Update a member',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Member' } } }
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
                responses: {
                    200: { description: 'Array of skills', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Skill' } } } } }
                }
            },
            post: {
                tags: ['Skills'],
                summary: 'Create a skill',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } }
                },
                responses: {
                    200: { description: 'New skill ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } }
                }
            }
        },
        '/api/skills/{id}': {
            put: {
                tags: ['Skills'],
                summary: 'Update a skill',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } }
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
                parameters: [
                    {
                        name: 'type',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string',
                            enum: ['by-member', 'by-skill', 'planned-sessions', 'critical-overdue', 'compliance-matrix', 'verification-history', 'training-attendance']
                        }
                    }
                ],
                responses: {
                    200: { description: 'Report data array or object' }
                }
            }
        },
        '/api/reports/pdf': {
            post: {
                tags: ['Reports'],
                summary: 'Generate a PDF from HTML content',
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
                    200: { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }
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
                    200: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
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
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
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
                summary: 'Generate MFA secret and QR code',
                responses: {
                    200: {
                        description: 'MFA setup data',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        secret: { type: 'string' },
                                        qrCodeUrl: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
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
                summary: 'Disable MFA for own account',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['password'], properties: { password: { type: 'string', format: 'password' } } } } }
                },
                responses: {
                    200: { description: 'MFA disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
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
        '/api/preferences': {
            get: {
                tags: ['System'],
                summary: 'Get all system preferences',
                responses: {
                    200: { description: 'Preferences map', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }
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
        '/api/logs': {
            post: {
                tags: ['System'],
                summary: 'Write a custom event log entry',
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
                    200: { description: 'Logged', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
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
