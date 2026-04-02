// tests/test-utils.js
const express = require('express');

/**
 * Creates an isolated Express application for testing one or multiple routers.
 * Automatically handles JSON parsing and injects a mock session.
 * * @param {Array|Object} routes - An array of route objects: [{ path: '/api/members', router: memberRouter }, ...]
 * (Also accepts a single object for backwards compatibility)
 * @param {Object} mockSession - Optional custom session object
 * @returns {Object} A configured Express app ready for Supertest
 */
function createTestApp(routes, mockSession = null) {
    const app = express();
    app.use(express.json());

    // Default mock session if none is provided
    const defaultSession = { 
        user: { id: 99, name: 'Test Admin', role: 'admin' } 
    };

    // Middleware to inject the fake session
    app.use((req, res, next) => {
        req.session = mockSession || defaultSession;
        next();
    });

    // Normalize input to an array so we can loop through it
    const routeArray = Array.isArray(routes) ? routes : [routes];

    // Mount all requested routers
    routeArray.forEach(route => {
        app.use(route.path, route.router);
    });

    return app;
}

module.exports = { createTestApp };