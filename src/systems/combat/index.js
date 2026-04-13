// Aggregates the registry and wires every known handler for the alpha
// combat engine. Callers (sim CLI, tests) do:
//
//   import { buildRegistry, CombatCore } from 'src/systems/combat/index.js';
//   const registry = buildRegistry();
//   const core = new CombatCore({ registry, seed: 42 });
//   const result = core.run({ player: defs, enemy: defs });

import { Registry } from './Registry.js';
import { CombatCore } from './CombatCore.js';

// Classes
import { ancientClass } from './classes/ancient.js';
import { knightClass } from './classes/knight.js';
import { tankClass } from './classes/tank.js';
import { assassinClass } from './classes/assassin.js';
import { gruntClass } from './classes/grunt.js';
import { berserkerClass } from './classes/berserker.js';
import { gunnerClass } from './classes/gunner.js';

// Factions
import { monsterFaction } from './factions/monster.js';
import { folkFaction } from './factions/folk.js';
import { robotFaction } from './factions/robot.js';

// Abilities
import { volatile_payload } from './abilities/volatile_payload.js';
import { sweeping_strikes } from './abilities/sweeping_strikes.js';
import { piercing_bolt } from './abilities/piercing_bolt.js';
import { heart_slam_on_death } from './abilities/heart_slam_on_death.js';
import { ricochet_volley } from './abilities/ricochet_volley.js';
import { spiteful_demise } from './abilities/spiteful_demise.js';
import { snipers_venom } from './abilities/snipers_venom.js';
import { death_defying } from './abilities/death_defying.js';
import { infectious_bite } from './abilities/infectious_bite.js';
import { ricochet_shot } from './abilities/ricochet_shot.js';
import { lobbed_bolt } from './abilities/lobbed_bolt.js';
import { reactive_reinforcement } from './abilities/reactive_reinforcement.js';
import { sacrifice_pass } from './abilities/sacrifice_pass.js';
import { bloodlust } from './abilities/bloodlust.js';
import { kill_piercing } from './abilities/kill_piercing.js';

export function buildRegistry() {
  const registry = new Registry();

  // Classes
  registry.registerClass(ancientClass);
  registry.registerClass(knightClass);
  registry.registerClass(tankClass);
  registry.registerClass(assassinClass);
  registry.registerClass(gruntClass);
  registry.registerClass(berserkerClass);
  registry.registerClass(gunnerClass);

  // Factions
  registry.registerFaction(monsterFaction);
  registry.registerFaction(folkFaction);
  registry.registerFaction(robotFaction);

  // Abilities
  registry.registerAbility(volatile_payload);
  registry.registerAbility(sweeping_strikes);
  registry.registerAbility(piercing_bolt);
  registry.registerAbility(heart_slam_on_death);
  registry.registerAbility(ricochet_volley);
  registry.registerAbility(spiteful_demise);
  registry.registerAbility(snipers_venom);
  registry.registerAbility(death_defying);
  registry.registerAbility(infectious_bite);
  registry.registerAbility(ricochet_shot);
  registry.registerAbility(lobbed_bolt);
  registry.registerAbility(reactive_reinforcement);
  registry.registerAbility(sacrifice_pass);
  registry.registerAbility(bloodlust);
  registry.registerAbility(kill_piercing);

  return registry;
}

export { CombatCore, Registry };
