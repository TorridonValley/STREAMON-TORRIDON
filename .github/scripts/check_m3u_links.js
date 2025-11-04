/**
 * M3U Live Stream Dead Link Checker
 * Checks live stream URLs in an M3U playlist and logs dead streams for Github Actions.
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class M3UChecker {
    constructor() {
        // Configuration
        this.M3U_FILE = 'free.m3u';
        this.REQUEST_TIMEOUT = 10000; // 10 seconds
        this.MAX_RETRIES = 2;
        this.DELAY_BETWEEN_REQUESTS = 1000; // 1 second
        this.USER_AGENT = 'M3U-Checker/1.0';
    }

    /**
     * Parse M3U file and extract stream URLs with metadata
     */
    parseM3U(filepath) {
        if (!fs.existsSync(filepath)) {
            throw new Error(`${filepath} not found!`);
        }

        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        
        const entries = [];
        let currentExtinf = null;

        for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
                // Parse EXTINF line with better regex to handle attributes
                // Format: #EXTINF:duration attribute="value" attribute="value",title
                const extinfMatch = line.match(/^#EXTINF:(.+)$/);
                if (extinfMatch) {
                    const extinfContent = extinfMatch[1];
                    
                    // Find the last comma which separates attributes from title
                    const lastCommaIndex = extinfContent.lastIndexOf(',');
                    
                    if (lastCommaIndex !== -1) {
                        const attributesPart = extinfContent.substring(0, lastCommaIndex).trim();
                        const title = extinfContent.substring(lastCommaIndex + 1).trim();
                        
                        // Extract group-title if present
                        const groupMatch = attributesPart.match(/group-title="([^"]+)"/);
                        const groupTitle = groupMatch ? groupMatch[1] : '';
                        
                        currentExtinf = {
                            title: title,
                            groupTitle: groupTitle
                        };
                    } else {
                        // Fallback for malformed EXTINF
                        currentExtinf = { 
                            title: extinfContent,
                            groupTitle: ''
                        };
                    }
                } else {
                    currentExtinf = { 
                        title: 'Unknown',
                        groupTitle: ''
                    };
                }
            } else if (!line.startsWith('#') && this.isValidUrl(line)) {
                // This should be a stream URL
                const entry = {
                    url: line,
                    title: currentExtinf ? currentExtinf.title : 'Unknown',
                    groupTitle: currentExtinf ? currentExtinf.groupTitle : ''
                };
                entries.push(entry);
                currentExtinf = null;
            }
        }

        return entries;
    }

    /**
     * Basic URL validation
     */
    isValidUrl(urlString) {
        try {
            new URL(urlString);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if stream URL is accessible
     * Returns Promise<{isAlive: boolean, error: string, statusCode: number}>
     */
    async checkUrl(url) {
        for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
            try {
                const result = await this.makeRequest(url);
                if (result.statusCode < 400) {
                    return { isAlive: true, error: '', statusCode: result.statusCode };
                } else {
                    return { isAlive: false, error: `HTTP ${result.statusCode}`, statusCode: result.statusCode };
                }
            } catch (error) {
                if (attempt === this.MAX_RETRIES - 1) {
                    return { isAlive: false, error: error.message, statusCode: 0 };
                }
                // Wait before retry
                await this.sleep(this.DELAY_BETWEEN_REQUESTS * (attempt + 1));
            }
        }
    }

    /**
     * Make HTTP request with timeout
     */
    makeRequest(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'HEAD',
                timeout: this.REQUEST_TIMEOUT,
                headers: {
                    'User-Agent': this.USER_AGENT
                }
            };

            const req = lib.request(options, (res) => {
                // If HEAD is not allowed, try GET with range
                if (res.statusCode === 405) {
                    this.makeGetRequest(url).then(resolve).catch(reject);
                    return;
                }
                resolve({ statusCode: res.statusCode });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Timeout after ${this.REQUEST_TIMEOUT}ms`));
            });

            req.on('error', (error) => {
                if (error.code === 'ECONNREFUSED') {
                    reject(new Error('Connection refused'));
                } else if (error.code === 'ENOTFOUND') {
                    reject(new Error('Host not found'));
                } else if (error.code === 'ETIMEDOUT') {
                    reject(new Error('Connection timeout'));
                } else {
                    reject(new Error(`Connection error: ${error.message}`));
                }
            });

            req.end();
        });
    }

    /**
     * Make GET request with range header (fallback for servers that don't support HEAD)
     */
    makeGetRequest(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                timeout: this.REQUEST_TIMEOUT,
                headers: {
                    'User-Agent': this.USER_AGENT,
                    'Range': 'bytes=0-1024'
                }
            };

            const req = lib.request(options, (res) => {
                // Consume response to prevent memory leak
                res.on('data', () => {});
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode });
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Timeout after ${this.REQUEST_TIMEOUT}ms`));
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log dead stream information
     */
    logDeadLink(entry, error, statusCode) {
        console.log(`\n🔴 DEAD STREAM FOUND:`);
        console.log(`   Title: ${entry.title}`);
        if (entry.groupTitle) {
            console.log(`   Group: ${entry.groupTitle}`);
        }
        console.log(`   URL: ${entry.url}`);
        console.log(`   Error: ${error}`);
        console.log(`   Status Code: ${statusCode || 'N/A'}`);
    }

    /**
     * Main function to check M3U live streams
     */
    async runCheck() {
        console.log(`🎵 M3U Live Stream Dead Link Checker`);
        console.log(`=====================================`);
        
        try {
            console.log(`📂 Parsing ${this.M3U_FILE}...`);
            const entries = this.parseM3U(this.M3U_FILE);
            console.log(`🔍 Found ${entries.length} streams to check\n`);

            if (entries.length === 0) {
                console.log('❌ No stream URLs found in playlist');
                return;
            }

            const deadStreams = [];
            let aliveCount = 0;

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const progress = `[${(i + 1).toString().padStart(3)}/${entries.length}]`;
                
                // Show group title in progress if available
                const displayTitle = entry.groupTitle ? 
                    `${entry.title} (${entry.groupTitle})` : entry.title;
                console.log(`${progress} Checking: ${displayTitle}`);
                
                const result = await this.checkUrl(entry.url);

                if (result.isAlive) {
                    aliveCount++;
                    console.log(`   ✅ Live (${result.statusCode})`);
                } else {
                    deadStreams.push({ entry, error: result.error, statusCode: result.statusCode });
                    console.log(`   ❌ Dead (${result.error})`);
                    
                    // Log dead stream details immediately
                    this.logDeadLink(entry, result.error, result.statusCode);
                }
                
                // Add delay between requests
                if (i < entries.length - 1) {
                    await this.sleep(this.DELAY_BETWEEN_REQUESTS);
                }
            }

            // Final summary
            console.log(`\n📊 CHECK COMPLETED`);
            console.log(`===================`);
            console.log(`✅ Live: ${aliveCount}`);
            console.log(`❌ Dead: ${deadStreams.length}`);
            console.log(`📈 Success Rate: ${((aliveCount / entries.length) * 100).toFixed(1)}%`);

            if (deadStreams.length > 0) {
                console.log(`\n🚨 DEAD STREAMS SUMMARY:`);
                console.log(`=========================`);
                deadStreams.forEach(({ entry, error }, index) => {
                    console.log(`${(index + 1).toString().padStart(2)}. ${entry.title}`);
                    if (entry.groupTitle) {
                        console.log(`    Group: ${entry.groupTitle}`);
                    }
                    console.log(`    URL: ${entry.url}`);
                    console.log(`    Error: ${error}`);
                    console.log('');
                });
            } else {
                console.log(`\n🎉 All streams are live! No issues found.`);
            }

        } catch (error) {
            console.error(`❌ Error during check: ${error.message}`);
            process.exit(1);
        }
    }
}

// Run the checker
if (require.main === module) {
    const checker = new M3UChecker();
    checker.runCheck().catch(error => {
        console.error(`💥 Fatal error: ${error.message}`);
        process.exit(1);
    });
}
