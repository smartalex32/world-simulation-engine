import { readFile } from 'node:fs/promises'
import { exportContentPack, importContentPack } from '../src/contentPacks'

const [command, input] = process.argv.slice(2)
if ((command !== 'validate' && command !== 'canonicalize') || !input) throw new Error('Usage: pnpm content-pack <validate|canonicalize> <pack.json>')
const pack = importContentPack(await readFile(input, 'utf8'))
if (command === 'validate') console.info(`${pack.manifest.id}@${pack.manifest.version} is valid (${pack.personVariables.length} variables, ${pack.influences.length} influences).`)
else console.info(exportContentPack(pack))
