// tests/surveys.test.js
const request = require("supertest");
const { createTestApp } = require("./test-utils");

// --- 1. MOCK DEPENDENCIES ---
jest.mock("../services/db", () => ({
  logEvent: jest.fn().mockResolvedValue(),
  getAllSurveys: jest.fn(),
  createSurvey: jest.fn(),
  getSurveyById: jest.fn(),
  updateSurvey: jest.fn(),
  deleteSurvey: jest.fn(),
  publishSurvey: jest.fn(),
  getLiveSurveyInstances: jest.fn(),
  getLiveSurveyInstanceById: jest.fn(),
  getSurveyResponses: jest.fn(),
  getSurveyTracking: jest.fn(),
  updateSurveyArchiveStatus: jest.fn(),
  deleteSurveyInstance: jest.fn(),
  getMemberById: jest.fn(),
  getAllPreferences: jest.fn().mockResolvedValue([]),
  getPreferences: jest.fn().mockResolvedValue({}),
}));

jest.mock("../services/mailer", () => ({
  sendSurveyInvitation: jest.fn().mockResolvedValue(),
}));

jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: "test-id" }),
  }),
}));

// Bypass RBAC for functional testing
jest.mock("../middleware/auth", () => ({
  hasRole: () => (req, res, next) => next(),
  ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 },
}));

const db = require("../services/db");
const mailer = require("../services/mailer");
const surveyRoutes = require("../routes/api/surveys");

// --- 2. BUILD THE ISOLATED APP ---
const app = createTestApp({ path: "/api/surveys", router: surveyRoutes });

// --- 3. RUN TESTS ---
describe("Surveys API Endpoints (Isolated)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- SURVEY TEMPLATE CRUD ---

  describe("GET /api/surveys", () => {
    it("should return 200 and an array of surveys", async () => {
      const mockData = [{ id: 1, name: "Test Survey", status: 1 }];
      db.getAllSurveys.mockResolvedValue(mockData);

      const response = await request(app).get("/api/surveys");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockData);
      expect(db.getAllSurveys).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/surveys", () => {
    it("should create a new survey and return 201", async () => {
      const newId = 5;
      db.createSurvey.mockResolvedValue({ id: newId });

      const payload = {
        name: "New Feedback Survey",
        intro: "<p>Hello</p>",
        status: 1,
        structure: [{ id: "q1", type: "radio", description: "Test" }],
      };

      const response = await request(app).post("/api/surveys").send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id", newId);

      // Verify the structure was stringified
      expect(db.createSurvey).toHaveBeenCalledWith(
        payload.name,
        payload.intro,
        payload.status,
        JSON.stringify(payload.structure),
        expect.any(Number), // authorId from session
      );
    });
  });

  describe("PUT /api/surveys/:id", () => {
    it("should update an existing survey", async () => {
      db.updateSurvey.mockResolvedValue();

      const updatePayload = {
        name: "Updated Name",
        intro: "Updated Intro",
        status: 1,
        structure: [],
      };

      const response = await request(app)
        .put("/api/surveys/1")
        .send(updatePayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "Survey updated successfully.",
      });
    });
  });

  // --- PUBLISHING & DISPATCH ---

// --- PUBLISHING & DISPATCH ---

    describe('POST /api/surveys/:id/publish', () => {
        it('should publish a survey, generate links, and return success message', async () => {
            const liveId = 10;
            
            // This mock data is packed with both camelCase and snake_case properties, 
            // ensuring it works flawlessly whether your route uses the old trackingData loop or the new allTracking loop.
            const mockTrackingData = [
                { memberId: 1, accessCode: 'code1', access_code: 'code1', email: 'test1@test.com', member_name: 'Test 1' },
                { memberId: 2, accessCode: 'code2', access_code: 'code2', email: 'test2@test.com', member_name: 'Test 2' }
            ];

            // 1. Mock DB functions
            db.publishSurvey.mockResolvedValue({ liveInstanceId: liveId, trackingData: mockTrackingData });
            db.getLiveSurveyInstanceById.mockResolvedValue({ name: 'Test Instance', public_id: 'guid-123' });
            db.getSurveyTracking.mockResolvedValue(mockTrackingData);
            
            // 2. Fallback mock just in case your route still calls getMemberById inside the loop
            db.getMemberById.mockResolvedValue({ email: 'test-fallback@test.com', name: 'Test Fallback' });

            const response = await request(app)
                .post('/api/surveys/1/publish')
                .send({ memberIds: [1, 2] });

            expect(response.status).toBe(200);
            
            // Check the standard JSON response
            expect(response.body.message).toContain('Survey published successfully');
            
            // Ensure the mailer was triggered exactly twice
            expect(mailer.sendSurveyInvitation).toHaveBeenCalledTimes(2);
        });

        it('should return 400 if no members are provided', async () => {
            const response = await request(app)
                .post('/api/surveys/1/publish')
                .send({ memberIds: [] });

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/least one member/);
        });
    });
  // --- LIVE INSTANCES & TRACKING ---

  describe("GET /api/surveys/instances/:liveId/results", () => {
    it("should fetch formatted survey results", async () => {
      db.getLiveSurveyInstanceById.mockResolvedValue({
        name: "Test Instance",
        structure: '[{"id":"q1"}]',
      });
      db.getSurveyResponses.mockResolvedValue([
        { id: 1, submitted_at: "2023-10-01", submitted_data: '{"q1":"Yes"}' },
      ]);
      db.getSurveyTracking.mockResolvedValue([
        { status: "submitted" },
        { status: "pending" },
      ]);

      const response = await request(app).get(
        "/api/surveys/instances/10/results",
      );

      expect(response.status).toBe(200);
      expect(response.body.instanceName).toBe("Test Instance");
      expect(response.body.responseCount).toBe(1);
      expect(response.body.stats.pending).toBe(1);
    });
  });

  describe("POST /api/surveys/instances/:liveId/remind-all", () => {
    it("should trigger reminders for all pending members", async () => {
      db.getSurveyTracking.mockResolvedValue([
        { status: "submitted", email: "test1@test.com" },
        {
          status: "pending",
          email: "test2@test.com",
          member_name: "Test 2",
          access_code: "code2",
        },
      ]);
      db.getLiveSurveyInstanceById.mockResolvedValue({
        name: "Test",
        template_id: 1,
      });
      db.getSurveyById.mockResolvedValue({ public_id: "guid-123" });

      const response = await request(app).post(
        "/api/surveys/instances/10/remind-all",
      );

      expect(response.status).toBe(200);

      // Check the standard JSON response instead of a stream
      expect(response.body.message).toContain("Reminder emails triggered");

      // Should only send 1 email because only 1 is pending
      expect(mailer.sendSurveyInvitation).toHaveBeenCalledTimes(1);
    });
  });
});
