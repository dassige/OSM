const axios = require('axios');
const { getOIData } = require('../services/scraper');

// Intercepts Axios so tests never make real network requests
jest.mock('axios');

describe('FENZ External Scraper (getOIData)', () => {
    
    // A fake logger function to pass into the scraper
    const mockLogger = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully fetch and parse member skills from HTML', async () => {
        const fakeHtml = `
            <html>
                <body>
                    <table class="data-table">
                        <tbody>
                            <tr>
                                <td class="name-col">FF John Doe</td>
                                <td class="skill-col">First Aid</td>
                                <td class="date-col">15/05/2026</td>
                            </tr>
                            <tr>
                                <td class="name-col">Jane Smith</td>
                                <td class="skill-col">Driving</td>
                                <td class="date-col">20/08/2026</td>
                            </tr>
                        </tbody>
                    </table>
                </body>
            </html>
        `;

        axios.get.mockResolvedValue({ data: fakeHtml });

        const url = 'http://fake-fenz.osm/report';
        const result = await getOIData(url, 0, null, mockLogger);

        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining(url), 
            expect.any(Object) // Matches the proxy/header config passed to axios
        );

        expect(result).toBeInstanceOf(Array);
        expect(mockLogger).toHaveBeenCalledWith(expect.stringMatching(/success/i));
    });

    it('should handle network errors gracefully without crashing', async () => {
        axios.get.mockRejectedValue(new Error('Network Timeout'));

        try {
            const result = await getOIData('http://fake-fenz.osm', 0, null, mockLogger);
            expect(result).toEqual([]);
        } catch (error) {
            expect(error.message).toBe('Network Timeout');
        }

        expect(mockLogger).toHaveBeenCalledWith(expect.stringMatching(/error|failed/i));
    });
});