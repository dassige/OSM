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
        { name: 'Knowledge Base', description: 'PDF document library — categories and documents with GUID-secured public viewer links' },
        { name: 'Quiz', description: 'Quiz game and question bank management for social learning sessions' },
        { name: 'Live Quiz', description: 'Self-paced quiz sessions, player access codes, and results' },
        { name: 'Bookings', description: 'Booking event templates and published booking events (slot scheduling, e.g. health screenings)' },
        { name: 'Live Bookings (Public)', description: 'Unauthenticated booking-page endpoints — the event GUID (plus a per-member code for personal links) is the access control' },
        { name: 'Skills Data Source', description: 'Skills Expiring in the Next Six Months PDF reports for the pdf-report extraction plugin — upload, automatic pickup (GCS / local file) and report history' }
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
            ExtractionSnapshot: {
                type: 'object',
                description: 'A stored Skills Expiring in the Next Six Months report (without the PDF bytes or parsed records)',
                properties: {
                    id:                  { type: 'integer', example: 12 },
                    plugin:              { type: 'string', example: 'pdf-report' },
                    source:              { type: 'string', enum: ['upload', 'gcs', 'local'] },
                    source_ref:          { type: 'string', nullable: true, description: 'GCS object generation or local file mtime:size' },
                    file_name:           { type: 'string', nullable: true, example: 'OSM-Status-6-months.pdf' },
                    file_hash:           { type: 'string', description: 'SHA-256 of the PDF' },
                    file_size:           { type: 'integer', example: 193625 },
                    report_created_date: { type: 'string', format: 'date', example: '2026-10-05' },
                    record_count:        { type: 'integer', example: 249 },
                    member_count:        { type: 'integer', example: 15 },
                    skill_count:         { type: 'integer', example: 32 },
                    warnings:            { type: 'array', items: { type: 'string' } },
                    created_by:          { type: 'string', example: 'System' },
                    created_at:          { type: 'string', example: '2026-10-05 01:00:00', description: 'UTC' }
                }
            },
            ExtractionSyncResult: {
                type: 'object',
                description: 'Outcome of an automatic or manual source check (all fields null before the first check)',
                properties: {
                    at:         { type: 'string', format: 'date-time', nullable: true },
                    source:     { type: 'string', enum: ['local', 'gcs', 'upload'], nullable: true },
                    status:     { type: 'string', enum: ['imported', 'unchanged', 'missing', 'rejected', 'error', 'skipped'], nullable: true },
                    message:    { type: 'string', nullable: true },
                    snapshotId: { type: 'integer', nullable: true }
                }
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
                    enabled: { type: 'integer', enum: [0, 1] },
                    kb_document_id: { type: 'integer', nullable: true, description: 'Linked Knowledge Base document (refresher material) sent with expiry notifications' },
                    kb_document_title: { type: 'string', nullable: true, description: 'Read-only — title of the linked KB document, if any' }
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
                    enabled: { type: 'integer', enum: [0, 1] },
                    kb_document_id: { type: 'integer', nullable: true, description: 'Knowledge Base document id to link as refresher material, or null to unlink' }
                }
            },
            QuizQuestion: {
                type: 'object',
                description: 'Mirrors the Form structure question shape — a score-based game is treated as a form. Timed games are restricted by the UI to type "radio" with exactly 4 options.',
                required: ['id', 'description'],
                properties: {
                    id: { type: 'string', example: 'fld_1700000000000' },
                    type: { type: 'string', enum: ['text_multi', 'radio', 'checkboxes', 'boolean'], default: 'radio' },
                    description: { type: 'string', example: 'What is the correct BA cylinder pressure check interval?' },
                    required: { type: 'boolean', default: true },
                    options: { type: 'array', items: { type: 'string' }, description: 'Required (min 1) for type radio/checkboxes; empty otherwise' },
                    renderAs: { type: 'string', enum: ['radio', 'dropdown'] },
                    correctAnswer: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], nullable: true },
                    points: { type: 'integer', default: 1, description: 'Used in score-based games' },
                    timeLimitSeconds: { type: 'integer', default: 20, description: 'Used in timed games' }
                }
            },
            QuizGame: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', example: 'Pump Operations Quiz' },
                    description: { type: 'string', nullable: true },
                    game_type: { type: 'string', enum: ['score', 'timed'] },
                    enabled: { type: 'boolean' },
                    questions: { type: 'array', items: { $ref: '#/components/schemas/QuizQuestion' } },
                    questionCount: { type: 'integer' }
                }
            },
            QuizGameInput: {
                type: 'object',
                required: ['name', 'game_type'],
                properties: {
                    name: { type: 'string', example: 'Pump Operations Quiz', maxLength: 255 },
                    description: { type: 'string', nullable: true },
                    game_type: { type: 'string', enum: ['score', 'timed'] },
                    enabled: { type: 'boolean', default: true },
                    questions: { type: 'array', items: { $ref: '#/components/schemas/QuizQuestion' } }
                }
            },
            BookingScheduleDay: {
                type: 'object',
                description: 'One day of a booking schedule. Dates and times are local wall-clock values in the brigade timezone.',
                properties: {
                    date: { type: 'string', format: 'date', example: '2026-11-10' },
                    windows: {
                        type: 'array',
                        items: { type: 'object', properties: { start: { type: 'string', example: '09:00' }, end: { type: 'string', example: '12:00' } } }
                    }
                }
            },
            BookingField: {
                type: 'object',
                description: 'A piece of information collected from members when they book',
                properties: {
                    id: { type: 'string', example: 'phone' },
                    label: { type: 'string', example: 'Mobile phone' },
                    type: { type: 'string', enum: ['text', 'tel', 'email', 'textarea'] },
                    required: { type: 'boolean' }
                }
            },
            BookingTemplateInput: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', maxLength: 200, example: 'Nurse Health Screening' },
                    description: { type: 'string', description: 'Rich text (sanitised)' },
                    location: { type: 'string', example: 'Station meeting room' },
                    contact_info: { type: 'string', example: 'Chief Fire Officer — 021 000 0000' },
                    slot_minutes: { type: 'integer', minimum: 5, maximum: 480, default: 15 },
                    slot_capacity: { type: 'integer', minimum: 1, maximum: 50, default: 1, description: 'Places per slot' },
                    schedule: { type: 'array', items: { $ref: '#/components/schemas/BookingScheduleDay' } },
                    fields: { type: 'array', maxItems: 20, items: { $ref: '#/components/schemas/BookingField' } },
                    access_type: { type: 'string', enum: ['general', 'personal'], default: 'personal' },
                    show_booked_names: { type: 'boolean', default: false, description: "Show other members' names on booked slots" },
                    allow_cancel: { type: 'boolean', default: true, description: 'Members may cancel/change their own booking' },
                    max_bookings: { type: 'integer', minimum: 1, maximum: 20, default: 1, description: 'Maximum number of slots one member may book (admins are not limited)' }
                }
            },
            BookingTemplate: {
                allOf: [
                    { $ref: '#/components/schemas/BookingTemplateInput' },
                    {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            slot_count: { type: 'integer', description: 'Number of slots the schedule produces' },
                            created_by: { type: 'string', nullable: true },
                            created_at: { type: 'string' },
                            updated_at: { type: 'string' }
                        }
                    }
                ]
            },
            BookingEvent: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    template_id: { type: 'integer', nullable: true },
                    public_id: { type: 'string', description: 'GUID slug used in the public booking link' },
                    name: { type: 'string' },
                    location: { type: 'string' },
                    access_type: { type: 'string', enum: ['general', 'personal'] },
                    show_booked_names: { type: 'boolean' },
                    allow_cancel: { type: 'boolean' },
                    max_bookings: { type: 'integer', description: 'Maximum bookings per member' },
                    is_locked: { type: 'boolean' },
                    is_enabled: { type: 'boolean' },
                    is_archived: { type: 'boolean' },
                    archived_at: { type: 'string', nullable: true },
                    published_by: { type: 'string', nullable: true },
                    published_at: { type: 'string' },
                    invited_count: { type: 'integer' },
                    booked_count: { type: 'integer', description: 'Members with at least one booking' },
                    entry_count: { type: 'integer', description: 'Total bookings' },
                    slot_count: { type: 'integer' },
                    total_capacity: { type: 'integer' },
                    first_date: { type: 'string', format: 'date' },
                    last_date: { type: 'string', format: 'date' }
                }
            },
            BookingSlot: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    slot_date: { type: 'string', format: 'date' },
                    start_time: { type: 'string', example: '09:00' },
                    end_time: { type: 'string', example: '09:15' },
                    capacity: { type: 'integer' },
                    is_blocked: { type: 'integer' },
                    booked_count: { type: 'integer' }
                }
            },
            BookingEventDetail: {
                allOf: [
                    { $ref: '#/components/schemas/BookingEvent' },
                    {
                        type: 'object',
                        properties: {
                            description: { type: 'string' },
                            contact_info: { type: 'string' },
                            fields: { type: 'array', items: { $ref: '#/components/schemas/BookingField' } },
                            link: { type: 'string', nullable: true, description: 'Shared link (general access only)' },
                            stats: {
                                type: 'object',
                                properties: {
                                    invited: { type: 'integer' }, booked: { type: 'integer' }, notBooked: { type: 'integer' },
                                    bookings: { type: 'integer', description: 'Total bookings (a member may hold several)' },
                                    slotCount: { type: 'integer' }, totalCapacity: { type: 'integer' }, freePlaces: { type: 'integer' }
                                }
                            },
                            slots: { type: 'array', items: { $ref: '#/components/schemas/BookingSlot' } },
                            roster: {
                                type: 'array',
                                description: 'Every invited member with their booking (if any)',
                                items: {
                                    type: 'object',
                                    properties: {
                                        member_id: { type: 'integer' }, display_name: { type: 'string' },
                                        email: { type: 'string', nullable: true }, mobile: { type: 'string', nullable: true },
                                        notified_at: { type: 'string', nullable: true }, notified_via: { type: 'string', nullable: true },
                                        booking_count: { type: 'integer', description: 'Bookings held by this member' },
                                        personal_link: { type: 'string', nullable: true, description: 'Personal access only' }
                                    }
                                }
                            },
                            entries: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' }, slot_id: { type: 'integer' }, member_id: { type: 'integer' },
                                        display_name: { type: 'string' }, slot_date: { type: 'string' }, start_time: { type: 'string' },
                                        end_time: { type: 'string' }, field_values: { type: 'object', additionalProperties: { type: 'string' } },
                                        source: { type: 'string', enum: ['member', 'admin'] }, booked_at: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            BookingNotificationSummary: {
                type: 'object',
                description: 'A member is notified on a channel only if the admin selected it AND the member preference includes it. In demo mode sends are simulated.',
                properties: {
                    emailSent: { type: 'integer' }, whatsappSent: { type: 'integer' }, whatsappQueued: { type: 'integer' },
                    failed: { type: 'integer' }, skipped: { type: 'integer' }, simulated: { type: 'boolean' }
                }
            },
            QuizSession: {
                type: 'object',
                description: 'An individual play instance of a quiz game (either type) — a frozen snapshot of its questions, run for a chosen set of members. For a Timed session, game_phase/current_question_index/total_questions track the live host-driven progress; for a Score session these stay at their defaults and total_sent/total_submitted are the meaningful progress fields.',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', example: 'Pump Operations Quiz - 2026-09-14' },
                    game_id: { type: 'integer' },
                    game_name: { type: 'string' },
                    game_type: { type: 'string', enum: ['score', 'timed'] },
                    is_archived: { type: 'boolean' },
                    created_at: { type: 'string', format: 'date-time' },
                    total_sent: { type: 'integer' },
                    total_submitted: { type: 'integer' },
                    game_phase: { type: 'string', enum: ['lobby', 'question', 'reveal', 'leaderboard', 'finished'] },
                    current_question_index: { type: 'integer' },
                    total_questions: { type: 'integer' }
                }
            },
            QuizPlayer: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    access_code: { type: 'string' },
                    status: { type: 'string', enum: ['sent', 'submitted'] },
                    member_name: { type: 'string' },
                    email: { type: 'string', nullable: true },
                    achieved_score: { type: 'number', nullable: true },
                    max_score: { type: 'number', nullable: true },
                    submitted_at: { type: 'string', format: 'date-time', nullable: true }
                }
            },
            CsrfTokenResponse: {
                type: 'object',
                properties: {
                    token: { type: 'string', nullable: true, description: '64-character hex CSRF token. Include as `X-CSRF-Token` header on all mutating requests. `null` for anonymous visitors, who do not need one.', example: 'a3f8b1...' }
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
                    geo_location: {
                        type: 'object', nullable: true,
                        description: 'Geographic location resolved from origin_ip using an offline GeoLite2 database. Null for private/loopback addresses or unrecognised IPs.',
                        properties: {
                            city:    { type: 'string', example: 'Auckland' },
                            region:  { type: 'string', example: 'Auckland' },
                            country: { type: 'string', example: 'NZ' }
                        }
                    },
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
                summary: 'Request password reset link (always returns 200)',
                description: 'Generates a 30-minute password reset token and emails a /reset-password.html link. Always returns HTTP 200 with an identical generic message regardless of whether the address is registered — prevents email enumeration.',
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
                    200: { description: 'Uniform response returned regardless of whether the address is registered' },
                    400: { description: 'Cannot reset Super Admin password via email' }
                }
            }
        },
        '/reset-password': {
            post: {
                tags: ['Auth'],
                summary: 'Complete password reset using a token from the reset email',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['token', 'newPassword'],
                                properties: {
                                    token: { type: 'string', description: '64-hex raw token from the reset link query string' },
                                    newPassword: { type: 'string', format: 'password', description: 'New password — minimum 8 characters, at least one uppercase letter and one digit' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Password updated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Token missing/invalid/expired, or password does not meet complexity requirements (min 8 chars, one uppercase, one digit)' },
                    500: { description: 'Unexpected server error' }
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
        // BOOKINGS (admin)
        // -------------------------------------------------------------------------
        '/api/bookings/templates': {
            get: {
                tags: ['Bookings'],
                summary: 'List booking templates',
                responses: {
                    200: { description: 'Array of templates', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/BookingTemplate' } } } } }
                }
            },
            post: {
                tags: ['Bookings'],
                summary: 'Create a booking template',
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingTemplateInput' } } } },
                responses: {
                    201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    400: { description: 'Validation error (bad dates/times, overlapping windows, limits)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/templates/{id}': {
            get: {
                tags: ['Bookings'],
                summary: 'Get a booking template',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Template', content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingTemplate' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            },
            put: {
                tags: ['Bookings'],
                summary: 'Update a booking template (full replacement)',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingTemplateInput' } } } },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            },
            delete: {
                tags: ['Bookings'],
                summary: 'Delete a booking template (published events are kept). Disabled in demo mode.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    403: { description: 'Demo mode', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/templates/{id}/duplicate': {
            post: {
                tags: ['Bookings'],
                summary: 'Duplicate a template — copies everything except the schedule (dates must be re-entered)',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    201: { description: 'New template ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/templates/{id}/publish': {
            post: {
                tags: ['Bookings'],
                summary: 'Publish a template as a live booking event and notify invited members',
                description: 'Snapshots the template, generates the slots and the invite roster. Personal access generates one access code per member. Options omitted from the body fall back to the template defaults.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['memberIds'],
                                properties: {
                                    name: { type: 'string', description: 'Event name (defaults to the template name)' },
                                    access_type: { type: 'string', enum: ['general', 'personal'] },
                                    show_booked_names: { type: 'boolean' },
                                    allow_cancel: { type: 'boolean' },
                                    max_bookings: { type: 'integer', minimum: 1, maximum: 20, description: 'Defaults to the template value' },
                                    memberIds: { type: 'array', items: { type: 'integer' } },
                                    notify: { type: 'object', properties: { email: { type: 'boolean' }, whatsapp: { type: 'boolean' } } }
                                }
                            },
                            example: { name: 'Nurse Health Screening 2026', access_type: 'personal', show_booked_names: false, allow_cancel: true, max_bookings: 1, memberIds: [1, 2, 3], notify: { email: true, whatsapp: true } }
                        }
                    }
                },
                responses: {
                    201: {
                        description: 'Published',
                        content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, publicId: { type: 'string' }, link: { type: 'string', nullable: true }, notifications: { $ref: '#/components/schemas/BookingNotificationSummary' } } } } }
                    },
                    400: { description: 'No members, unknown members, invalid access type, invalid maximum, or no slots', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Template not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/events': {
            get: {
                tags: ['Bookings'],
                summary: 'List published booking events with counts',
                responses: {
                    200: { description: 'Array of events', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/BookingEvent' } } } } }
                }
            }
        },
        '/api/bookings/events/{id}': {
            get: {
                tags: ['Bookings'],
                summary: 'Event dashboard — info, status, stats, slots, roster (booked / not booked) and bookings',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Event detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingEventDetail' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            },
            delete: {
                tags: ['Bookings'],
                summary: 'Delete an archived event with all its slots and bookings. Disabled in demo mode.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Event is not archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Demo mode', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/events/{id}/lock': {
            patch: {
                tags: ['Bookings'],
                summary: 'Lock or unlock an event — when locked, members can view but not book, change or cancel',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['locked'], properties: { locked: { type: 'boolean' } } } } } },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Invalid body or archived event', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/events/{id}/enable': {
            patch: {
                tags: ['Bookings'],
                summary: 'Enable or disable the public link (reversible until archived)',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } } } },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Invalid body or archived event', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/events/{id}/archive': {
            put: {
                tags: ['Bookings'],
                summary: 'Archive an event (one-way — the public link stops working permanently). Disabled in demo mode.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Already archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Demo mode', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/events/{id}/bookings': {
            post: {
                tags: ['Bookings'],
                summary: 'Add a booking on behalf of an invited member (allowed while locked, not once archived). Required fields and the per-member maximum are not enforced.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['memberId', 'slotId'], properties: { memberId: { type: 'integer' }, slotId: { type: 'integer' }, fieldValues: { type: 'object', additionalProperties: { type: 'string' } } } }, example: { memberId: 2, slotId: 12, fieldValues: { phone: '021 123 4567' } } } }
                },
                responses: {
                    201: { description: 'Created — returns the booking (entry) id', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    400: { description: 'Missing/invalid slot, invalid field value, or archived event', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Event not found or member not invited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    409: { description: 'Slot is full, or the member already holds this slot', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/events/{id}/bookings/{entryId}': {
            put: {
                tags: ['Bookings'],
                summary: 'Move a booking to another slot and/or update its answers (admin). A failed move leaves the booking where it was.',
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'entryId', in: 'path', required: true, schema: { type: 'integer' }, description: 'Booking id (entries[].id in the event dashboard)' }
                ],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['slotId'], properties: { slotId: { type: 'integer' }, fieldValues: { type: 'object', additionalProperties: { type: 'string' } } } }, example: { slotId: 13, fieldValues: { phone: '021 123 4567' } } } }
                },
                responses: {
                    200: { description: 'Saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Missing/invalid slot, invalid field value, or archived event', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Event not found or booking does not belong to it', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    409: { description: 'Target slot is full, or the member already holds it', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            },
            delete: {
                tags: ['Bookings'],
                summary: 'Cancel one booking (admin)',
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'entryId', in: 'path', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Cancelled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Archived event', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Event not found or booking does not belong to it', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/bookings/events/{id}/remind': {
            post: {
                tags: ['Bookings'],
                summary: 'Send reminders to one member (memberId) or to every invited member who has not booked',
                description: 'Only while the event is open (enabled, not locked, not archived). Channels default to email + WhatsApp, filtered by each member preference.',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: false,
                    content: { 'application/json': { schema: { type: 'object', properties: { memberId: { type: 'integer' }, notify: { type: 'object', properties: { email: { type: 'boolean' }, whatsapp: { type: 'boolean' } } } } }, example: { notify: { email: true, whatsapp: true } } } }
                },
                responses: {
                    200: { description: 'Processed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, notifications: { $ref: '#/components/schemas/BookingNotificationSummary' } } } } } },
                    400: { description: 'Event not open, member already booked, or everyone has booked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // LIVE BOOKINGS (public booking page — no auth)
        // -------------------------------------------------------------------------
        '/api/live-bookings/{publicId}': {
            get: {
                tags: ['Live Bookings (Public)'],
                summary: 'Load a booking page (public)',
                description: 'Personal links must pass `code`. General links return the invited roster (names only); pass `memberId` once the member has picked their name to get their own booking. Archived and unknown links return 404, disabled links 403. Answers are only echoed back on personal links. Slot times are local to `event.timezone`; `is_past` is true once a slot has started.',
                security: [],
                parameters: [
                    { name: 'publicId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
                    { name: 'code', in: 'query', required: false, schema: { type: 'string', format: 'uuid' }, description: 'Personal access code (personal links only)' },
                    { name: 'memberId', in: 'query', required: false, schema: { type: 'integer' }, description: 'Selected member (general links only)' }
                ],
                responses: {
                    200: {
                        description: 'Booking page data',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        event: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, contact_info: { type: 'string' },
                                                slot_minutes: { type: 'integer' }, access_type: { type: 'string', enum: ['general', 'personal'] },
                                                show_booked_names: { type: 'boolean' }, allow_cancel: { type: 'boolean' }, max_bookings: { type: 'integer' }, is_locked: { type: 'boolean' },
                                                fields: { type: 'array', items: { $ref: '#/components/schemas/BookingField' } },
                                                timezone: { type: 'string', example: 'Pacific/Auckland' }
                                            }
                                        },
                                        slots: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    id: { type: 'integer' }, slot_date: { type: 'string', format: 'date' }, start_time: { type: 'string' }, end_time: { type: 'string' },
                                                    capacity: { type: 'integer' }, available: { type: 'integer' }, is_blocked: { type: 'boolean' }, is_past: { type: 'boolean' },
                                                    is_mine: { type: 'boolean' },
                                                    booked_names: { type: 'array', items: { type: 'string' }, description: 'Only when show_booked_names is on' }
                                                }
                                            }
                                        },
                                        me: {
                                            type: 'object', nullable: true,
                                            properties: {
                                                memberId: { type: 'integer' }, displayName: { type: 'string' },
                                                bookings: { type: 'array', description: 'The member\'s bookings in slot order', items: { type: 'object', properties: { entryId: { type: 'integer' }, slotId: { type: 'integer' }, slot_date: { type: 'string' }, start_time: { type: 'string' }, end_time: { type: 'string' }, field_values: { type: 'object', description: 'Personal links only' } } } }
                                            }
                                        },
                                        roster: {
                                            type: 'array', description: 'General links only',
                                            items: { type: 'object', properties: { memberId: { type: 'integer' }, displayName: { type: 'string' }, hasBooked: { type: 'boolean' } } }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    400: { description: 'Selected member is not invited (general links)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Booking page disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Unknown/archived link, or missing/invalid personal code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-bookings/{publicId}/book': {
            post: {
                tags: ['Live Bookings (Public)'],
                summary: 'Book a slot, or change one of my bookings (public)',
                description: 'Without `entryId`: adds a booking, up to the event\'s `max_bookings` per member. With `entryId`: moves that booking or updates its answers (only when the event allows changes, `allow_cancel`). Required fields are enforced. Refused while locked or for slots that have already started.',
                security: [],
                parameters: [{ name: 'publicId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object', required: ['slotId'],
                                properties: {
                                    code: { type: 'string', description: 'Personal links' },
                                    memberId: { type: 'integer', description: 'General links' },
                                    entryId: { type: 'integer', description: 'One of my bookings, to move/update it' },
                                    slotId: { type: 'integer' },
                                    fieldValues: { type: 'object', additionalProperties: { type: 'string' } }
                                }
                            },
                            example: { code: 'e581aac2-0cab-4de0-b2cc-df3a470117bc', slotId: 12, fieldValues: { phone: '021 123 4567' } }
                        }
                    }
                },
                responses: {
                    200: { description: 'Saved', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, booking: { type: 'object', properties: { entryId: { type: 'integer' }, slotId: { type: 'integer' }, slot_date: { type: 'string' }, start_time: { type: 'string' }, end_time: { type: 'string' } } } } } } } },
                    400: { description: 'Invalid slot, slot already started, missing name, or invalid answer', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Event locked or disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Unknown/archived link or invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    409: { description: 'Slot full, slot already held by me, maximum bookings reached, or changes not allowed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-bookings/{publicId}/cancel': {
            post: {
                tags: ['Live Bookings (Public)'],
                summary: 'Cancel one of my bookings (public)',
                description: 'Only when the event allows cancelling, is not locked, and the appointment has not started. `entryId` is required when the member holds more than one booking.',
                security: [],
                parameters: [{ name: 'publicId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'string' }, memberId: { type: 'integer' }, entryId: { type: 'integer' } } }, example: { code: 'e581aac2-0cab-4de0-b2cc-df3a470117bc', entryId: 21 } } }
                },
                responses: {
                    200: { description: 'Cancelled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Appointment already started, missing name, or entryId needed (several bookings)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Cancelling not allowed, or event locked/disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'No booking, unknown/archived link, or invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // QUIZ
        // -------------------------------------------------------------------------
        '/api/quiz/games': {
            get: {
                tags: ['Quiz'],
                summary: 'List all quiz games',
                responses: {
                    200: { description: 'Array of quiz games', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/QuizGame' } } } } }
                }
            },
            post: {
                tags: ['Quiz'],
                summary: 'Create a quiz game',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/QuizGameInput' } } }
                },
                responses: {
                    200: { description: 'New game ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } },
                    400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/quiz/games/{id}': {
            get: {
                tags: ['Quiz'],
                summary: 'Get a quiz game (including its question bank)',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Quiz game', content: { 'application/json': { schema: { $ref: '#/components/schemas/QuizGame' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            },
            put: {
                tags: ['Quiz'],
                summary: 'Update a quiz game and its question bank (all fields optional)',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/QuizGameInput' } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            },
            delete: {
                tags: ['Quiz'],
                summary: 'Delete a quiz game',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/quiz/games/{id}/export': {
            get: {
                tags: ['Quiz'],
                summary: 'Export a quiz game as a downloadable JSON file',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'JSON file download', content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, game_type: { type: 'string' }, questions: { type: 'array', items: { $ref: '#/components/schemas/QuizQuestion' } } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/quiz/games/{id}/toggle': {
            patch: {
                tags: ['Quiz'],
                summary: 'Toggle a quiz game enabled/disabled',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Toggled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },

        // -------------------------------------------------------------------------
        // LIVE QUIZ (self-paced sessions)
        // -------------------------------------------------------------------------
        '/api/live-quiz/sessions': {
            get: {
                tags: ['Live Quiz'],
                summary: 'List quiz sessions',
                responses: {
                    200: { description: 'Array of quiz sessions', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/QuizSession' } } } } }
                }
            },
            post: {
                tags: ['Live Quiz'],
                summary: 'Start a quiz session — snapshots a game (either type) and generates one access code per selected member',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['gameId', 'memberIds'], properties: { gameId: { type: 'integer' }, memberIds: { type: 'array', items: { type: 'integer' } } } } } }
                },
                responses: {
                    200: { description: 'Session started', content: { 'application/json': { schema: { type: 'object', properties: { sessionId: { type: 'integer' }, sessionName: { type: 'string' }, players: { type: 'array', items: { $ref: '#/components/schemas/QuizPlayer' } } } } } } },
                    400: { description: 'Validation error (e.g. no members selected)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/sessions/{id}': {
            get: {
                tags: ['Live Quiz'],
                summary: 'Get a quiz session with its player list',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Session with players', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/QuizSession' }, { type: 'object', properties: { players: { type: 'array', items: { $ref: '#/components/schemas/QuizPlayer' } } } }] } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            },
            delete: {
                tags: ['Live Quiz'],
                summary: 'Delete a quiz session and all its player results',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/live-quiz/sessions/{id}/archive': {
            put: {
                tags: ['Live Quiz'],
                summary: 'Archive or unarchive a quiz session',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { is_archived: { type: 'boolean' } } } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/live-quiz/sessions/{id}/players/{playerId}/send': {
            post: {
                tags: ['Live Quiz'],
                summary: "Send (or resend) a player's invitation email",
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Sent', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Player has no registered email', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/team-sessions': {
            get: {
                tags: ['Live Quiz'],
                summary: 'List team setups (both game types)',
                responses: {
                    200: { description: 'Array of team sessions', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } }
                }
            },
            post: {
                tags: ['Live Quiz'],
                summary: 'Create a team setup (drag-and-drop team builder) — playable immediately for both game types',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    gameId: { type: 'integer' },
                                    teams: {
                                        type: 'array',
                                        items: { type: 'object', properties: { name: { type: 'string' }, memberIds: { type: 'array', items: { type: 'integer' } } } }
                                    }
                                }
                            },
                            example: { gameId: 1, teams: [{ name: 'Team Red', memberIds: [1, 2] }, { name: 'Team Blue', memberIds: [3, 4] }] }
                        }
                    }
                },
                responses: {
                    200: { description: 'Created — one access code per team', content: { 'application/json': { schema: { type: 'object', properties: { teamSessionId: { type: 'integer' }, sessionName: { type: 'string' }, gameType: { type: 'string', enum: ['score', 'timed'] }, teams: { type: 'array', items: { type: 'object' } } } } } } },
                    400: { description: 'Validation failed (fewer than 2 teams, empty team, duplicate member, etc.)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/team-sessions/{id}': {
            get: {
                tags: ['Live Quiz'],
                summary: 'Get a team setup with its teams and rosters',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Team session with teams array', content: { 'application/json': { schema: { type: 'object' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            },
            delete: {
                tags: ['Live Quiz'],
                summary: 'Delete a team setup and its teams',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/live-quiz/team-sessions/{id}/archive': {
            put: {
                tags: ['Live Quiz'],
                summary: 'Archive or unarchive a team setup',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { is_archived: { type: 'boolean' } } }, example: { is_archived: true } } }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/live-quiz/players/{playerId}/review': {
            get: {
                tags: ['Live Quiz'],
                summary: "Admin: view a player's submitted quiz with correct/incorrect answers marked",
                parameters: [{ name: 'playerId', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Submitted questions, answers, and score', content: { 'application/json': { schema: { type: 'object' } } } },
                    400: { description: 'Player has not submitted yet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Player not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/teams/{teamId}/review': {
            get: {
                tags: ['Live Quiz'],
                summary: "Admin: view a team's submitted quiz with correct/incorrect answers marked (Score-based team setups)",
                parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Submitted questions, answers, and score', content: { 'application/json': { schema: { type: 'object' } } } },
                    400: { description: 'Team has not submitted yet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Team not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/join': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Public: resolve a short join code (no auth) to a kind and code for redirecting to quiz-play.html',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } }, example: { code: 'K3P9XZ' } } }
                },
                responses: {
                    200: { description: 'Resolved', content: { 'application/json': { schema: { type: 'object', properties: { kind: { type: 'string', enum: ['individual', 'team'] }, code: { type: 'string' } } } } } },
                    400: { description: 'No code submitted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'This session is archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Code not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/play/{code}': {
            get: {
                tags: ['Live Quiz'],
                summary: "Public: fetch a player's quiz by access code (no auth)",
                parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: "Score-based: the question list. Timed: the live host state (status: 'live') — phase, currentQuestionIndex, totalQuestions, and (while a question is open) currentQuestion with the correct answer stripped out until revealed — once revealed, correctAnswer and myAnswer (this participant's own recorded pick, if any) are included too. Either type: the stored score if already submitted.", content: { 'application/json': { schema: { type: 'object' } } } },
                    403: { description: 'Session archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/play/{code}/submit': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Public: submit a whole Score-based quiz for scoring (no auth) — Timed quizzes are answered live, one question at a time, via live-answer',
                parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    description: 'Flat answer object keyed by question id (question.id[] for checkboxes), same contract as Forms submission.',
                    content: { 'application/json': { schema: { type: 'object' } } }
                },
                responses: {
                    200: { description: 'Scored', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, achievedScore: { type: 'number' }, maxScore: { type: 'number' } } } } } },
                    400: { description: 'Already submitted, invalid data, or this is a Timed session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Session archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/play/{code}/live-answer': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Public: answer the current live-hosted question (Timed only, no auth) — scored server-side from how quickly it was given',
                parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { answer: { type: 'string' } } }, example: { answer: 'A' } } }
                },
                responses: {
                    200: { description: 'Answer recorded', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, isCorrect: { type: 'boolean' }, points: { type: 'number' } } } } } },
                    400: { description: 'No question is currently live, already answered, or not a Timed session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/team-play/{code}': {
            get: {
                tags: ['Live Quiz'],
                summary: "Public: fetch a team's quiz by access code (no auth, both game types)",
                parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: "Score-based: the question list. Timed: the live host state (status: 'live') — phase, currentQuestionIndex, totalQuestions, and (while a question is open) currentQuestion with the correct answer stripped out until revealed — once revealed, correctAnswer and myAnswer (this participant's own recorded pick, if any) are included too. Either type: the stored score if already submitted.", content: { 'application/json': { schema: { type: 'object' } } } },
                    403: { description: 'Team setup archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/team-play/{code}/submit': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Public: submit a whole Score-based team quiz for scoring (no auth) — Timed quizzes are answered live, one question at a time, via live-answer',
                parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    description: 'Flat answer object keyed by question id (question.id[] for checkboxes), same contract as Forms submission.',
                    content: { 'application/json': { schema: { type: 'object' } } }
                },
                responses: {
                    200: { description: 'Scored', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, achievedScore: { type: 'number' }, maxScore: { type: 'number' } } } } } },
                    400: { description: 'Already submitted, invalid data, or this is a Timed session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    403: { description: 'Team setup archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/team-play/{code}/live-answer': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Public: answer the current live-hosted question for a team (Timed only, no auth)',
                parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { answer: { type: 'string' } } }, example: { answer: 'A' } } }
                },
                responses: {
                    200: { description: 'Answer recorded', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, isCorrect: { type: 'boolean' }, points: { type: 'number' } } } } } },
                    400: { description: 'No question is currently live, already answered, or not a Timed session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Invalid code', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/leaderboard/{kind}/{sessionId}': {
            get: {
                tags: ['Live Quiz'],
                summary: 'Admin: live standings for the standalone Launch leaderboard window (either game type)',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['individual', 'team'] } },
                    { name: 'sessionId', in: 'path', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Ranked standings', content: { 'application/json': { schema: { type: 'object', properties: { sessionName: { type: 'string' }, gameType: { type: 'string', enum: ['score', 'timed'] }, rankings: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, status: { type: 'string' }, achievedScore: { type: 'number' }, maxScore: { type: 'number' }, accessCode: { type: 'string' } } } } } } } } },
                    400: { description: 'Invalid kind', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/host/{kind}/{sessionId}/state': {
            get: {
                tags: ['Live Quiz'],
                summary: 'Admin: current state for the Launch host screen (Timed only) — pass resume=1 on an actual page (re)open to collapse an in-progress question straight to the leaderboard instead of resuming mid-question; omitted on routine live-event refetches so an active question is not collapsed the instant it starts',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['individual', 'team'] } },
                    { name: 'sessionId', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'resume', in: 'query', required: false, schema: { type: 'string', enum: ['1'] }, description: 'Pass 1 only on a genuine page (re)open' }
                ],
                responses: {
                    200: { description: 'Host state — phase, roster, and (depending on phase) the current question or leaderboard', content: { 'application/json': { schema: { type: 'object' } } } },
                    400: { description: 'Invalid kind, or the session is not a Timed session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/host/{kind}/{sessionId}/start': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Admin: start the live-hosted game — moves the lobby to question 1 and broadcasts it to every joined player/team',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['individual', 'team'] } },
                    { name: 'sessionId', in: 'path', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Started', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Already started, invalid kind, or not a Timed session', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                }
            }
        },
        '/api/live-quiz/host/{kind}/{sessionId}/reveal': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Admin: reveal the correct answer for the current question — also triggered automatically once every participant has answered',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['individual', 'team'] } },
                    { name: 'sessionId', in: 'path', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Revealed (or already revealed — idempotent)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/live-quiz/host/{kind}/{sessionId}/show-leaderboard': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Admin: advance from the answer reveal to the leaderboard',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['individual', 'team'] } },
                    { name: 'sessionId', in: 'path', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Leaderboard shown', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } }
                }
            }
        },
        '/api/live-quiz/host/{kind}/{sessionId}/next': {
            post: {
                tags: ['Live Quiz'],
                summary: 'Admin: advance from the leaderboard to the next question, or finish the game and finalize every score on the last question',
                parameters: [
                    { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['individual', 'team'] } },
                    { name: 'sessionId', in: 'path', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Advanced', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, phase: { type: 'string', enum: ['question', 'finished'] } } } } } },
                    400: { description: 'The leaderboard has not been shown yet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
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
        '/api/forms/test-score': {
            post: {
                tags: ['Forms'],
                summary: 'Scoring simulator — score sample answers against a form structure (admin)',
                description: 'Scores sample answers against a (possibly unsaved) form structure using the same logic as a live submission. When ENABLE_AI_EVALUATION is true, paragraph (`text_multi`) answers with a reference answer are graded by the configured AI provider. Nothing is stored. Shares the AI test rate limit (10 requests per minute).',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['structure', 'answers'],
                                properties: {
                                    structure: { type: 'array', minItems: 1, maxItems: 200, description: 'Form questions, same shape as a saved form structure', items: { type: 'object' } },
                                    answers:   { type: 'object', description: 'Sample answers keyed by question id — string for radio/boolean/text_multi, array of strings for checkboxes', additionalProperties: true }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Simulated score',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        achieved:  { type: 'number' },
                                        maximum:   { type: 'number' },
                                        aiEnabled: { type: 'boolean' },
                                        feedback:  {
                                            type: 'object',
                                            description: 'Per paragraph question id',
                                            additionalProperties: {
                                                type: 'object',
                                                properties: {
                                                    score:           { type: 'number' },
                                                    reason:          { type: 'string' },
                                                    reviewSuggested: { type: 'boolean', description: 'Present (true) only for low-confidence Jev scores' }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    400: { description: 'Invalid structure or answers' },
                    429: { description: 'Rate limit exceeded — max 10 AI test requests per minute' },
                    500: { description: 'Scoring failed' }
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
        '/api/surveys': {
            get: {
                tags: ['Surveys'],
                summary: 'List all survey templates (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: {
                    200: { description: 'Array of survey templates' },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role (admin required)' }
                }
            }
        },
        '/api/surveys/{id}': {
            get: {
                tags: ['Surveys'],
                summary: 'Get a survey template by ID (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Survey template detail including full question structure' },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role (admin required)' },
                    404: { description: 'Survey not found' }
                }
            }
        },
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
                summary: 'List training sessions (admin)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [
                    { name: 'view', in: 'query', schema: { type: 'string', enum: ['future', 'all'] }, description: 'Filter to future sessions only' }
                ],
                responses: {
                    200: { description: 'Array of training sessions', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TrainingSession' } } } } },
                    401: { description: 'Not authenticated' },
                    403: { description: 'Insufficient role (admin required)' }
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
                            enum: ['by-member', 'by-skill', 'planned-sessions', 'critical-overdue', 'compliance-matrix', 'verification-history', 'training-attendance', 'survey-participation', 'survey-response-log', 'quiz-performance']
                        }
                    },
                    {
                        name: 'days',
                        in: 'query',
                        required: false,
                        schema: { type: 'integer', minimum: 1, maximum: 3650, default: 30 },
                        description: 'Look-back window in days for time-filtered reports (by-member, by-skill, verification-history, survey-response-log, quiz-performance — defaults to 90 for quiz-performance). Clamped server-side to 1–3650. Defaults to 30 when omitted.'
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
                                    newPassword: { type: 'string', format: 'password', description: 'New password — minimum 8 characters, at least one uppercase letter and one digit' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Password does not meet complexity requirements (min 8 chars, one uppercase, one digit)' }
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
                description: 'Returns a 64-character hex token tied to the current session. Include it as the `X-CSRF-Token` header on all POST, PUT, PATCH, and DELETE requests made by a logged-in user. The `utils.js` fetch interceptor on authenticated pages handles this automatically. Anonymous visitors (public booking, survey and form pages) receive `{ "token": null }` with status 200 — they do not need a token, and no session is created for them.',
                security: [{ sessionCookie: [] }, {}],
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
                summary: 'Restore from a backup file (superadmin)',
                description: 'Uploads a `.sql` dump (database only) or a `.zip` full backup (database + Knowledge Base documents) and fully replaces the current data. Every Knowledge Base document bundled in a `.zip` is written into this environment\'s own configured storage (local disk, or its own S3/GCS bucket) and its record repointed, regardless of what storage backend or bucket the backup was taken from. All active sessions are invalidated after restore. Disabled in demo mode. Irreversible. For files too large for a single request (Cloud Run enforces a ~32MB request-body limit), use `/api/system/restore/chunk` + `/api/system/restore/finalize` instead — the browser UI does this automatically.',
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['databaseFile'],
                                properties: {
                                    databaseFile: { type: 'string', format: 'binary', description: 'Backup file to restore from — .sql (database only) or .zip (full backup)' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Restored', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'No file provided or invalid backup file' },
                    403: { description: 'Insufficient role or demo mode' },
                    429: { description: 'Rate limit exceeded — max 3 restores per hour' },
                    500: { description: 'Restore failed' }
                }
            }
        },
        '/api/system/restore/chunk': {
            post: {
                tags: ['System'],
                summary: 'Upload one chunk of a large restore file (superadmin)',
                description: 'Accepts one chunk of a backup file too large for a single request (Cloud Run enforces a ~32MB request-body limit at the platform layer). Chunks are staged on disk keyed by `uploadId` until `/api/system/restore/finalize` reassembles and restores them. Used internally by the Backup & Restore UI; small backups should just use `/api/system/restore` directly.',
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['chunk', 'uploadId', 'chunkIndex', 'totalChunks'],
                                properties: {
                                    chunk:       { type: 'string', format: 'binary', description: 'Raw bytes of this chunk (max 20MB each)' },
                                    uploadId:    { type: 'string', description: 'Client-generated UUID identifying this upload session' },
                                    chunkIndex:  { type: 'integer', description: 'Zero-based index of this chunk' },
                                    totalChunks: { type: 'integer', description: 'Total number of chunks in this upload' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Chunk accepted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, received: { type: 'integer' }, total: { type: 'integer' } } } } } },
                    400: { description: 'No chunk provided, or invalid uploadId/chunkIndex/totalChunks' },
                    403: { description: 'Insufficient role or demo mode' },
                    429: { description: 'Rate limit exceeded — max 150 chunk uploads per hour' },
                    500: { description: 'Chunk upload failed' }
                }
            }
        },
        '/api/system/restore/finalize': {
            post: {
                tags: ['System'],
                summary: 'Reassemble uploaded chunks and run the restore (superadmin)',
                description: 'Concatenates every chunk previously uploaded for `uploadId` in order, then runs the exact same restore logic as `/api/system/restore` against the reassembled file. Disabled in demo mode. Irreversible.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['uploadId', 'filename', 'totalChunks'],
                                properties: {
                                    uploadId:    { type: 'string', description: 'The uploadId used for the preceding chunk uploads' },
                                    filename:    { type: 'string', description: 'Original filename (its extension determines .sql vs .zip handling)' },
                                    totalChunks: { type: 'integer', description: 'Total number of chunks that were uploaded' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Restored', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Invalid uploadId/filename/totalChunks, or chunks missing/expired' },
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
                description: 'Submits a question/rubric/answer triple to the configured AI provider and returns the score and justification. Used to verify AI scoring configuration before enabling it for live forms. With provider `jev` (TypeSafe AI) the score is rounded to the nearest half point, the justification names the closest rubric level, and `confidence` / `reviewSuggested` are also returned. Rate-limited to 10 requests per minute.',
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
                                            provider:  { type: 'string', enum: ['gemini', 'ollama', 'jev'] },
                                            geminiKey: { type: 'string', description: 'Pass "USE_SERVER_DEFAULT" to use the server key' },
                                            jevKey:    { type: 'string', description: 'TypeSafe Jev API key. Pass "USE_SERVER_DEFAULT" to use the server key' },
                                            ollamaUrl: { type: 'string' },
                                            model:     { type: 'string', description: 'e.g. gemini-1.5-pro, qwen3:1.7b, jev-latest' }
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
                                        success: { type: 'boolean' },
                                        result: {
                                            type: 'object',
                                            properties: {
                                                score:           { type: 'number' },
                                                justification:   { type: 'string' },
                                                confidence:      { type: 'number', description: 'Jev only — model certainty, 0–1' },
                                                reviewSuggested: { type: 'boolean', description: 'Jev only — true when confidence is below JEV_MIN_CONFIDENCE' }
                                            }
                                        },
                                        raw:      { type: 'string', description: 'Raw provider response' },
                                        metadata: { type: 'object', properties: { duration: { type: 'string', example: '245ms' } } }
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
                summary: 'List subdirectories within the backup root (superadmin)',
                description: 'Returns the immediate child directories of the given path. Used by the Backup & Restore UI to let an admin navigate the server filesystem when selecting a backup save location. The path must be inside the configured backup root directory (BACKUP_ROOT_DIR) — requests outside this root are rejected with HTTP 400.',
                security: [{ sessionCookie: [] }, { apiKey: [] }],
                parameters: [
                    { name: 'path', in: 'query', required: false, schema: { type: 'string', default: '/' }, description: 'Absolute server path to list. Must be inside the configured BACKUP_ROOT_DIR.' }
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
                                    backupLocation: { type: 'string', example: '/backups/opready', description: 'Must resolve inside the configured backup root (BACKUP_ROOT_DIR); leave empty to use the default location.' },
                                    retentionType:  { type: 'string', enum: ['count', 'days', 'none'] },
                                    retentionValue: { type: 'integer', example: 10 }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Configuration saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'backupLocation resolves outside the configured backup root' },
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
                summary: 'Upload a document',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: {
                        type: 'object',
                        required: ['file', 'title'],
                        properties: {
                            file: { type: 'string', format: 'binary', description: 'Document file — PDF, Word, Excel, RTF, TXT, Markdown, PNG, JPG, or BMP (max 50 MB)' },
                            title: { type: 'string', example: 'Fire Attack Procedures' },
                            description: { type: 'string', nullable: true },
                            category_id: { type: 'integer', nullable: true },
                            expires_at: { type: 'string', format: 'date', nullable: true, example: '2027-06-04', description: 'ISO date after which the document is flagged as expired and its public link stops working' }
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
                            file: { type: 'string', format: 'binary', description: 'Replacement file — PDF, Word, Excel, RTF, TXT, Markdown, PNG, JPG, or BMP (max 50 MB)' }
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
                responses: { 200: { description: 'Document metadata' }, 404: { description: 'Not found, inactive, or expired' } }
            }
        },
        '/api/knowledgebase/file/{slug}': {
            get: {
                tags: ['Knowledge Base'],
                summary: 'Serve the document file by GUID slug (no auth required — GUID is the access control)',
                parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'File binary stream — Content-Type reflects the stored document (PDF, Word, Excel, RTF, TXT, Markdown, PNG, JPG, or BMP)', content: { 'application/pdf': {}, 'image/png': {}, 'image/jpeg': {} } },
                    404: { description: 'Not found, inactive, or expired' }
                }
            }
        },
        '/api/extraction/status': {
            get: {
                tags: ['Skills Data Source'],
                summary: 'Data source status — active plugin, configured source, current report and last automatic check',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: {
                    200: { description: 'Status', content: { 'application/json': { schema: {
                        type: 'object',
                        properties: {
                            activePlugin:   { type: 'object', properties: { name: { type: 'string', example: 'pdf-report' }, description: { type: 'string' } } },
                            source:         { type: 'string', enum: ['local', 'gcs', 'upload'], description: 'PDF_SOURCE — where new reports are picked up from automatically' },
                            sourceLocation: { type: 'string', nullable: true, example: 'gs://my-bucket/OSM-Status-6-months.pdf' },
                            maxSizeMb:      { type: 'integer', example: 10 },
                            staleWarnDays:  { type: 'integer', example: 35 },
                            retention:      { type: 'integer', example: 24, description: 'Number of reports kept' },
                            latest:         { allOf: [{ $ref: '#/components/schemas/ExtractionSnapshot' }], nullable: true },
                            ageDays:        { type: 'integer', nullable: true, description: 'Days since the current report was created' },
                            isStale:        { type: 'boolean', description: 'ageDays is greater than staleWarnDays' },
                            lastSync:       { $ref: '#/components/schemas/ExtractionSyncResult' }
                        }
                    } } } }
                }
            }
        },
        '/api/extraction/snapshots': {
            get: {
                tags: ['Skills Data Source'],
                summary: 'List stored reports, newest first (the first one is the current data)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: { 200: { description: 'Array of reports', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ExtractionSnapshot' } } } } } }
            }
        },
        '/api/extraction/snapshots/{id}': {
            delete: {
                tags: ['Skills Data Source'],
                summary: 'Delete a stored report — deleting the current one makes the previous report current (disabled in demo mode)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    400: { description: 'Invalid id' },
                    403: { description: 'Forbidden or demo mode' },
                    404: { description: 'Report not found' }
                }
            }
        },
        '/api/extraction/snapshots/{id}/file': {
            get: {
                tags: ['Skills Data Source'],
                summary: 'Download the original PDF of a stored report',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'PDF file (attachment)', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
                    404: { description: 'Report not found' }
                }
            }
        },
        '/api/extraction/upload': {
            post: {
                tags: ['Skills Data Source'],
                summary: 'Upload a Skills Expiring in the Next Six Months PDF report (disabled in demo mode)',
                description: 'The report is parsed before it is accepted. An identical file returns status "unchanged". A report created before the current one is refused with 409 unless force=true. Suitable for automations (e.g. n8n) using an X-API-Key header.',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                requestBody: {
                    required: true,
                    content: { 'multipart/form-data': { schema: {
                        type: 'object',
                        required: ['file'],
                        properties: {
                            file:  { type: 'string', format: 'binary', description: 'The PDF report (max PDF_MAX_SIZE_MB, default 10 MB)' },
                            force: { type: 'string', enum: ['true', 'false'], default: 'false', description: '"true" accepts a report older than the current one' }
                        }
                    } } }
                },
                responses: {
                    200: { description: 'Imported or unchanged', content: { 'application/json': { schema: {
                        type: 'object',
                        properties: {
                            success:           { type: 'boolean', example: true },
                            status:            { type: 'string', enum: ['imported', 'unchanged'] },
                            id:                { type: 'integer', example: 12 },
                            reportCreatedDate: { type: 'string', format: 'date', example: '2026-10-05' },
                            recordCount:       { type: 'integer', example: 249, description: 'Imported only' },
                            memberCount:       { type: 'integer', example: 15, description: 'Imported only' },
                            skillCount:        { type: 'integer', example: 32, description: 'Imported only' },
                            warnings:          { type: 'array', items: { type: 'string' }, description: 'Imported only — parser warnings' }
                        }
                    } } } },
                    400: { description: 'No file, not a PDF, or not a readable skills report' },
                    403: { description: 'Forbidden or demo mode' },
                    409: { description: 'Report is older than the current report — resend with force=true to accept it' },
                    413: { description: 'File is larger than PDF_MAX_SIZE_MB' }
                }
            }
        },
        '/api/extraction/sync': {
            post: {
                tags: ['Skills Data Source'],
                summary: 'Check the configured source (PDF_SOURCE=gcs or local) for a newer report now (disabled in demo mode)',
                security: [{ sessionCookie: [] }, { xApiKey: [] }],
                responses: {
                    200: { description: 'Outcome of the check', content: { 'application/json': { schema: { $ref: '#/components/schemas/ExtractionSyncResult' } } } },
                    403: { description: 'Forbidden or demo mode' }
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
