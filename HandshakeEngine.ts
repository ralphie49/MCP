import * as fs from 'fs';

// This is your "Address Book" for the 12+ tools needed
const MCP_REGISTRY: Record<string, string> = {
    "Java": "http://mcp-server/java-v21",
    "Python": "http://mcp-server/py-v3.12",
    "Rust": "http://mcp-server/rust-secure",
    "Docker": "http://mcp-server/docker-engine",
    "MongoDB": "http://mcp-server/mongo-db-v6"
};

export class HandshakeEngine {
    static start(fileName: string) {
        try {
            // 1. Read the file
            const content = fs.readFileSync(`./agents/${fileName}`, 'utf-8');

            // 2. Parse Technologies (The "Handshake" targets)
            // We look for the list under 'Supported Technologies'
            const techMatch = content.match(/technologies:([\s\S]*?)---/);
            if (!techMatch) return { success: false, error: "No technologies found" };

            const techs = techMatch[1]
                .split('\n')
                .map(t => t.replace(/[-\s*]/g, '').trim())
                .filter(t => t.length > 0);

            // 3. Perform the Handshake
            const connectedTools: string[] = [];
            for (const tech of techs) {
                if (MCP_REGISTRY[tech]) {
                    connectedTools.push(tech);
                } else {
                    console.warn(`[Handshake] Warning: No MCP Server for ${tech}`);
                }
            }

            return { 
                success: connectedTools.length > 0, 
                tools: connectedTools,
                error: connectedTools.length === 0 ? "No tools available" : null 
            };

        } catch (err) {
            return { success: false, error: "File not found or corrupted" };
        }
    }
}