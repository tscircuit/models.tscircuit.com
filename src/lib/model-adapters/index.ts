import { adapter as ballbearing } from "./ballbearing"
import { adapter as buttonscrew } from "./buttonscrew"
import { adapter as cablegrommet } from "./cablegrommet"
import { adapter as clampingshaftcollar } from "./clampingshaftcollar"
import { adapter as compressionspring } from "./compressionspring"
import { adapter as flangedbushing } from "./flangedbushing"
import { adapter as flatheadscrew } from "./flatheadscrew"
import { adapter as hexnut } from "./hexnut"
import { adapter as hollowpositioningarmtube } from "./hollowpositioningarmtube"
import { adapter as panscrew } from "./panscrew"
import { adapter as plainbushing } from "./plainbushing"
import { adapter as rigidcoupler } from "./rigidcoupler"
import { adapter as shaftcollar } from "./shaftcollar"
import { adapter as threadedrod } from "./threadedrod"
import { adapter as torsionspring } from "./torsionspring"
import { adapter as tslotextrusion } from "./tslotextrusion"
import { adapter as tslotgusset } from "./tslotgusset"
import { adapter as tslotinsidecorner } from "./tslotinsidecorner"

export const modelAdapters = {
  ballbearing,
  buttonscrew,
  cablegrommet,
  clampingshaftcollar,
  compressionspring,
  flangedbushing,
  flatheadscrew,
  hexnut,
  hollowpositioningarmtube,
  panscrew,
  plainbushing,
  rigidcoupler,
  shaftcollar,
  threadedrod,
  torsionspring,
  tslotextrusion,
  tslotgusset,
  tslotinsidecorner,
} as const
