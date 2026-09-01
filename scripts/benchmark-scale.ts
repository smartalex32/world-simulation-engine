import { cpus, totalmem } from 'node:os'
import {
  runMixedFidelityBenchmark,
  runMixedFidelityCadenceSmoke,
  runScheduledPhaseBenchmarks,
  runTenThousandPersonBenchmark,
} from '../src/simulation/engine/scaleBenchmark'

const seed = process.env.WORLD_BENCHMARK_SEED
const processors = cpus()
const result = {
  hardware: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpuModel: processors[0]?.model ?? 'unknown',
    logicalCpus: processors.length,
    memoryBytes: totalmem(),
  },
  detailed: await runTenThousandPersonBenchmark(seed),
  mixedFidelity: await runMixedFidelityBenchmark(seed ? `${seed}-mixed` : undefined),
  scheduledPhases: await runScheduledPhaseBenchmarks(seed ? `${seed}-phases` : undefined),
  mixedFidelityCadence: await runMixedFidelityCadenceSmoke(seed ? `${seed}-cadence` : undefined),
}
console.info(JSON.stringify(result, null, 2))
