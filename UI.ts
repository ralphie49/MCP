import { HandshakeEngine } from './HandshakeEngine';

// This simulates the User clicking the "Run" button in the AURA App
function onUserClickRun(agentFileName: string) {
    console.log(`[UI] User clicked RUN for: ${agentFileName}`);
    
    // Call Vaishnavi's Handshake Logic
    const session = HandshakeEngine.start(agentFileName);

    if (session.success) {
        console.log(`[UI] Agent is LIVE. Tools connected: ${session.tools.join(", ")}`);
    } else {
        console.log(`[UI] Failed to start agent: ${session.error}`);
    }
}

// SIMULATION: Running the Security Agent
onUserClickRun('security-agent.md');