jest.mock('../services/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const logger = require('../services/logger');
const { runValidation } = require('../services/env-validator');

const demoConfig = (aiConfig) => ({ appMode: 'demo', proxyMode: 'none', aiConfig });

describe('env-validator — Jev provider', () => {
    let exitSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    });
    afterEach(() => exitSpy.mockRestore());

    it('aborts startup when AI_PROVIDER=jev and JEV_API_KEY is missing', () => {
        runValidation(demoConfig({ enabled: true, provider: 'jev', model: 'jev-latest' }));

        expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/JEV_API_KEY is required/));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('warns (without aborting) when the model does not look like a Jev model', () => {
        runValidation(demoConfig({ enabled: true, provider: 'jev', model: 'gemini-1.5-pro', jevKey: 'k' }));

        expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/does not look like a Jev model/));
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('does not require a Jev key when AI evaluation is disabled', () => {
        runValidation(demoConfig({ enabled: false, provider: 'jev', model: 'jev-latest' }));

        expect(logger.error).not.toHaveBeenCalledWith(expect.stringMatching(/JEV_API_KEY/));
        expect(exitSpy).not.toHaveBeenCalled();
    });
});
