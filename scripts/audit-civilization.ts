import { runCivilizationIntegrationAudit } from '../src/simulation/scenarios/civilizationAudit'

const result = await runCivilizationIntegrationAudit()
console.log(JSON.stringify(result, null, 2))
if (!result.recoveryMatchesUninterrupted) process.exitCode = 1
