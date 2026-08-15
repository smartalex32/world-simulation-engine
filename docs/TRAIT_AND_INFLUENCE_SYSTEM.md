# Trait, Influence, and Emergent Society System Specification

Status: target architecture. Implement only the smallest subset needed by the active milestone.

## 1. Purpose

This document defines the trait, influence, behavioral, developmental, community, and environmental systems for the spatial world simulation engine.

The simulation is intended to model how:

- Individual predispositions influence behavior.
- Individuals respond differently to identical circumstances.
- Experiences influence beliefs, values, and long-term development.
- Nearby people influence one another.
- Geography affects exposure and interaction.
- Households influence children.
- Communities emerge from collective individual behavior.
- Community conditions feed back into individual development.
- Environmental and structural conditions affect society.
- Society changes over generations.

The system shall use explicit rules, mathematical relationships, probability distributions, and seeded pseudo-randomness. Generative AI or LLMs shall not be required for simulation behavior.

## 2. Core Design Principle

Do not model behavior using direct thresholds such as:

```ts
if (rebelliousness > 0.7) joinRebellion()
```

Use this causal pipeline instead:

```text
Traits
  -> Perception
  -> Needs / Values / Goals
  -> Available Actions
  -> Utility / Propensity
  -> Probability Distribution
  -> Seeded Stochastic Selection
  -> Behavior
  -> Experience
  -> Individual / Community Effects
```

Traits should primarily modify how agents evaluate the world rather than directly dictate actions.

## 3. Variable Layers

Do not store every person characteristic as a generic trait. Separate variables into layers with different rates of change:

```text
CORE DISPOSITIONS
  -> LEARNED VALUES AND ATTITUDES
  -> BELIEFS / KNOWLEDGE
  -> CURRENT PHYSICAL / EMOTIONAL STATE
  -> NEEDS / GOALS
  -> DECISION VARIABLES
  -> BEHAVIOR
  -> EXPERIENCE
  -> DEVELOPMENT
```

## 4. Core Dispositions

Core dispositions are relatively persistent tendencies. They may change through development and significant experiences but should normally change much more slowly than emotional state, beliefs, or attitudes.

The suggested default range is `0.0–1.0`. The system shall support configurable normalization if another representation is later preferred.

## 5. Default Core Disposition Registry: Temperament

| Trait | Positive influence | Negative influence | Typical macro effect |
|---|---|---|---|
| Curiosity | Exploration, information seeking, learning, innovation | Information avoidance, rigid routine | Innovation and cultural exchange |
| Novelty Seeking | Experimentation, migration, exploration | Routine preference | Cultural change and mobility |
| Risk Tolerance | Exploration, entrepreneurship, dangerous action | Risk avoidance | Innovation, migration, conflict participation |
| Patience | Planning, savings, persistence | Impulsivity | Investment and institutional stability |
| Impulsivity | Rapid action, immediate reward seeking | Planning, patience | Behavioral volatility |
| Persistence | Goal completion, learning, skill development | Abandonment | Productivity |
| Adaptability | Adjustment to new environments | Rigidity | Migration success and resilience |
| Emotional Stability | Consistent decisions, resilience | Emotional volatility | Social stability |
| Anxiety Sensitivity | Vigilance, precaution | Exploration, risk taking | Security-focused behavior |
| Aggression | Retaliation, dominance, conflict willingness | Compromise | Violence and coercion |
| Threat Sensitivity | Vigilance, defensive action | Trust and openness | Defensive social behavior |
| Optimism | Investment, exploration, future orientation | Perceived danger | Entrepreneurship |
| Pessimism | Precaution, saving | Experimentation | Conservative behavior |
| Frustration Tolerance | Persistence, compromise | Aggressive reaction | Stability |
| Sensation Seeking | Exploration, dangerous activities | Routine | Exploration and risk behavior |

## 6. Social Dispositions

| Trait | Positive influence | Negative influence | Typical macro effect |
|---|---|---|---|
| Sociability | Interaction frequency, network size | Isolation | Dense social networks |
| Empathy | Helping, cooperation, tolerance | Cruelty | Social cohesion |
| Trust Propensity | Cooperation, relationship formation | Suspicion | Trade and collective action |
| Conformity | Norm adoption, group cohesion | Deviance, novelty | Cultural stability |
| Cooperativeness | Reciprocity, collective action | Conflict | Community organization |
| Competitiveness | Achievement, rivalry | Cooperation under competition | Productivity and inequality |
| Dominance | Leadership attempts, hierarchy | Submission | Hierarchy formation |
| Submission | Authority acceptance | Leadership challenge | Hierarchical stability |
| Loyalty | Long-term affiliation | Defection | Durable relationships |
| Generosity | Helping, reciprocal behavior | Resource retention | Mutual aid |
| Approval Seeking | Norm following, reputation concern | Deviance | Stronger social norms |
| Independence | Autonomy, dissent | Conformity | Entrepreneurship and pluralism |
| Forgiveness | Relationship repair | Retaliation | Lower persistent conflict |
| Vindictiveness | Grievance persistence, retaliation | Forgiveness | Feuds and factional conflict |
| Social Sensitivity | Reputation awareness, peer responsiveness | Independence | Strong informal norms |

## 7. Cognitive Dispositions

| Trait | Positive influence | Negative influence | Typical macro effect |
|---|---|---|---|
| Pragmatism | Compromise, utility-based decisions | Ideological rigidity | Political and economic compromise |
| Abstract Thinking | Theory formation, long planning | Immediate reasoning | Philosophy and science |
| Analytical Tendency | Evidence evaluation, planning | Impulsive reasoning | Technical development |
| Creativity | Innovation, unconventional solutions | Conventionality | Technological and cultural innovation |
| Skepticism | Verification, resistance to misinformation | Unquestioning acceptance | Institutional scrutiny |
| Dogmatism | Belief persistence | Belief updating | Ideological stability |
| Intellectual Humility | Updating beliefs, tolerance | Dogmatism | Intellectual pluralism |
| Pattern Seeking | Discovery, causal inference | Randomness acceptance | Discovery and superstition |
| Decisiveness | Fast action | Hesitation | Faster collective response |
| Planning Horizon | Saving, delayed gratification | Immediate consumption | Investment |
| Cognitive Flexibility | Adaptation, belief updating | Ideological rigidity | Cultural adaptation |
| Need for Certainty | Conformity, dogmatism | Ambiguity tolerance | Ideological consolidation |
| Ambiguity Tolerance | Exploration, experimentation | Certainty seeking | Innovation and pluralism |

## 8. Motivational Dispositions

| Trait | Positive influence | Negative influence | Typical macro effect |
|---|---|---|---|
| Ambition | Achievement, leadership attempts | Satisfaction with current status | Competition and mobility |
| Status Seeking | Reputation behavior, competition | Egalitarian satisfaction | Hierarchy |
| Power Seeking | Leadership, political behavior | Submission | Political competition |
| Wealth Seeking | Trade, work, investment | Leisure preference | Commercial activity |
| Security Seeking | Saving, defensive action | Risk behavior | Stability |
| Achievement Motivation | Skill development, persistence | Inactivity | Productivity |
| Autonomy Seeking | Independence, migration, dissent | Submission | Entrepreneurship |
| Belonging Need | Group participation, conformity | Isolation | Cohesion and faction formation |
| Purpose Seeking | Ideological commitment | Aimlessness | Movement formation |
| Legacy Motivation | Long-term investment | Short-term orientation | Institutions and dynasties |
| Territorial Attachment | Local defense, community loyalty | Migration | Regional identity |
| Family Orientation | Caregiving, kin loyalty | Individual mobility | Strong kin institutions |

## 9. Values

Values shall be more environmentally plastic than core dispositions. Parents, household, community, peers, institutions, religion, education, economic circumstances, and significant experiences may strongly affect them.

| Value | Reinforces | Competes with | Typical society effect |
|---|---|---|---|
| Tradition | Conformity, continuity | Novelty | Cultural persistence |
| Liberty | Autonomy, dissent | Authoritarianism | Individual rights |
| Equality | Redistribution, cooperation | Hierarchy acceptance | Egalitarian institutions |
| Authority | Hierarchy acceptance | Rebellion | Centralization |
| Family | Kin loyalty | Individual mobility | Kin-based institutions |
| Community | Cooperation | Extreme individualism | Collective institutions |
| Religion | Religious participation | Secular orientation | Religious institutions |
| Honor | Reputation concern, retaliation | Forgiveness | Honor culture |
| Justice | Opposition to unfairness | Corruption acceptance | Reform and courts |
| Mercy | Forgiveness | Punitive preference | Rehabilitation |
| Order | Security, conformity | Revolutionary behavior | Stable institutions |
| Individualism | Autonomy | Collectivism | Entrepreneurship |
| Collectivism | Cooperation | Individual autonomy | Collective action |
| Materialism | Wealth seeking | Asceticism | Commerce and consumption |
| Stewardship | Conservation | Exploitation | Sustainable resource behavior |
| Merit | Achievement | Hereditary hierarchy | Social mobility |
| Duty | Sacrifice, persistence | Individual preference | Civic participation |
| Tolerance | Out-group interaction | Xenophobia | Pluralism |

## 10. Learned Attitudes

Learned attitudes shall change substantially throughout life.

| Attitude | Reinforces | Suppresses | Macro consequence |
|---|---|---|---|
| Authority Trust | Compliance | Opposition | Political legitimacy |
| Institutional Trust | Cooperation | Informal alternatives | Institutional effectiveness |
| Political Efficacy | Participation | Apathy | Mobilization |
| Xenophobia | In-group identification | Out-group trust | Segregation |
| Nationalism | National loyalty | Cosmopolitanism | State cohesion |
| Militarism | Military participation | Pacifism | Military power |
| Class Consciousness | Class solidarity | Cross-class identity | Class politics |
| Religious Tolerance | Intergroup contact | Sectarianism | Pluralism |
| Cultural Tolerance | Migration acceptance | Xenophobia | Cultural integration |
| Corruption Tolerance | Informal exchange | Accountability | Corruption persistence |
| Government Legitimacy | Compliance | Rebellion | Stability |
| Economic Optimism | Investment | Precaution | Economic growth |
| Perceived Injustice | Political mobilization | Authority trust | Unrest |
| Out-Group Trust | Trade and cooperation | Xenophobia | Cultural exchange |
| Local Attachment | Community participation | Migration | Regional cohesion |

## 11. Short-Term States

Short-term states may temporarily dominate long-term dispositions. They shall update much more frequently and normally decay toward baseline unless reinforced.

| State | Positive influence | Negative influence |
|---|---|---|
| Hunger | Food seeking, migration pressure | Patience and satisfaction |
| Thirst | Water seeking | Other priorities |
| Fatigue | Rest preference | Productivity |
| Fear | Threat avoidance, security seeking | Exploration |
| Anger | Aggression, retaliation | Compromise |
| Stress | Threat sensitivity, impulsivity | Cognitive flexibility |
| Grief | Social dependence or withdrawal | Motivation |
| Resentment | Protest, retaliation | Authority trust |
| Hope | Persistence, investment | Despair |
| Contentment | Stability | Migration and opposition |
| Loneliness | Social seeking | Isolation |
| Pride | Confidence, status behavior | Submission |
| Shame | Norm compliance, withdrawal | Deviance |
| Envy | Competition | Satisfaction |
| Desperation | Risk taking, migration | Risk avoidance |

## 12. Needs

Needs participate directly in action-utility calculations. Defaults may include food, water, rest, safety, shelter, family, social connection, belonging, status, autonomy, wealth, and purpose. Need urgency is not a personality trait.

For example, `hunger = 0.92` may strongly increase the utility of Eat, Find Food, Travel Toward Food, Request Food, or Steal Food, but the selected behavior still depends on personality, values, relationships, opportunity, and context.

## 13. Community-Level Variables

Separate community variables into:

- **Emergent social properties**, derived from people and their behavior.
- **Structural properties**, representing conditions that cannot be calculated by simply averaging people.

Do not treat the two concepts identically.

## 14. Emergent Community Properties

Emergent properties should generally derive from population characteristics, behavior, social networks, relationships, events, group activity, and geographic interaction patterns.

| Community property | Encourages | Suppresses |
|---|---|---|
| Social Trust | Personal trust, cooperation | Suspicion |
| Social Cohesion | Belonging, cooperation | Isolation |
| Norm Strength | Conformity | Deviance |
| Cultural Openness | Curiosity expression, tolerance | Xenophobia |
| Cultural Conformity | Norm adoption | Novelty |
| Community Violence | Fear, aggression | Trust |
| Innovation Climate | Curiosity expression, experimentation | Conformity pressure |
| Cooperation Level | Helping behavior | Competition |
| Conflict Level | Threat sensitivity | Trust |
| Social Mobility | Ambition, optimism | Fatalism |
| Community Resilience | Hope, cooperation | Desperation |

## 15. Structural Community Properties

| Structural property | Person-level pressure | Society effect |
|---|---|---|
| Political Stability | Security | Investment |
| Institutional Legitimacy | Authority trust | Compliance |
| Institutional Effectiveness | Optimism, trust | State capacity |
| Corruption | Cynicism | Institutional decline |
| Repression | Fear, resentment | Short-term compliance |
| Political Freedom | Autonomy expression | Pluralism |
| Economic Inequality | Status competition, resentment | Class conflict |
| Wealth | Security | Economic opportunity |
| Poverty | Stress, desperation | Instability |
| Food Security | Contentment | Stability |
| Education Access | Learning | Innovation |
| Literacy | Information exposure | Information propagation |
| Information Freedom | Skepticism and knowledge | Pluralism |
| Propaganda Intensity | Conformity, nationalism | Information diversity |
| Cultural Diversity | Out-group exposure | Homogeneity |
| Segregation | In-group identity | Cross-group trust |
| Urbanization | Social exposure | Geographic isolation |
| Population Density | Encounter rate | Privacy |
| Crime | Fear | Social trust |
| Rule of Law | Planning and trust | Retaliation |
| War Exposure | Fear, trauma | Stability |
| External Threat | Nationalism and conformity | Dissent |
| Trade Connectivity | Openness and wealth | Isolation |
| Infrastructure | Mobility | Isolation |
| Migration Inflow | Diversity | Homogeneity |
| Migration Outflow | Diaspora relationships | Population stability |

## 16. Physical Environment Variables

| Environmental variable | Person-level pressure | Society-level effect |
|---|---|---|
| Resource Abundance | Security | Wealth and population growth |
| Resource Scarcity | Competition | Conflict and migration |
| Agricultural Productivity | Food security | Population density |
| Water Availability | Settlement attraction | Settlement formation |
| Climate Harshness | Planning and adaptation | Infrastructure requirements |
| Seasonal Variability | Storage behavior | Seasonal institutions |
| Disaster Frequency | Threat sensitivity | Migration and resilience |
| Disease Burden | Fear and mortality | Demographic pressure |
| Terrain Difficulty | Isolation | Cultural divergence |
| River Access | Mobility | Trade |
| Coastal Access | Exploration | Maritime culture |
| Mountain Barriers | Isolation | Cultural divergence |
| Road Connectivity | Interaction | Cultural convergence |
| Travel Danger | Risk filtering | Isolation |
| Resource Concentration | Competition | Urbanization and inequality |
| Resource Dispersion | Distributed activity | Decentralized settlement |

## 17. Influence Graph Architecture

Do not implement a dense matrix where every variable affects every other variable. Two hundred variables would create 40,000 possible relationships, most of which should be zero. Use a sparse directed influence graph:

```text
Source Variable -> Influence Edge -> Target Variable / Decision Modifier / Process
```

## 18. Influence Edge

An edge should contain enough information to describe how one variable affects another system:

```json
{
  "id": "curiosity_exploration",
  "source": "person.trait.curiosity",
  "target": "decision.explorationUtility",
  "direction": "positive",
  "weight": 0.35,
  "timeHorizon": "immediate",
  "curve": "linear"
}
```

## 19. Influence Edge Properties

Edges should eventually support ID, source, target, weight, direction, curve, minimum and maximum source thresholds, context requirements, time horizon, delay, decay, age modifier, exposure modifier, confidence, and enabled state. Not every property is required initially; the structure must permit later introduction.

## 20. Influence Directions

Support at least `POSITIVE`, `NEGATIVE`, and `CONTEXT_DEPENDENT`. Positive means a higher source tends to increase the target; negative means it tends to decrease the target. Neither label is a moral judgment.

## 21. Influence Strength

Weights should normally be modifiers rather than direct assignment. Avoid applying `target += source * 0.8` indiscriminately. Incorporate effects according to the target system:

```text
explorationUtility =
    baseExplorationUtility
    + curiosityModifier
    + noveltyModifier
    + resourceModifier
    + knowledgeModifier
    - dangerModifier
    - travelCostModifier
```

## 22. Influence Curves

The system should eventually support linear, threshold, sigmoid, inverse, diminishing-return, bell, and piecewise curves. Initial implementation may support only linear effects, provided expansion remains possible.

## 23. Conditional Influence

Some effects exist only under specific circumstances. Risk tolerance should reduce perceived risk cost when evaluating a risky opportunity; it should not continuously create risky behavior when no such opportunity exists. Conformity requires a visible perceived social norm before it can influence behavior.

## 24. Example Conditional Edge

```json
{
  "source": "person.trait.conformity",
  "target": "decision.normComplianceUtility",
  "weight": 0.4,
  "condition": {
    "requiresPerceivedNorm": true
  }
}
```

## 25. Time Horizon

Influences should support `Immediate`, `Short`, `Medium`, `Long`, `Developmental`, and `Generational` horizons. Government repression may suppress open dissent in the short term while increasing resentment and opposition in the long term; these are separate edges.

## 26. Example Multi-Horizon Influence

```text
REPRESSION -> Fear -> Open dissent decreases

REPRESSION
  -> Perceived injustice
  -> Resentment
  -> Authority trust declines
  -> Long-term opposition rises
```

Do not represent repression as one universal modifier on rebellion.

## 27. Geographic Exposure

Environmental and social influence shall depend on actual exposure. Avoid assigning every settlement property to every member. Calculate exposure from home, current location, workplace, school, social locations, travel paths, nearby individuals, interaction frequency, institutional exposure, and time spent in a location.

## 28. Exposure Model

Conceptually:

```text
Influence Exposure =
    Source Strength
    × Time Exposed
    × Geographic Accessibility
    × Relationship Strength
    × Source Prestige
    × Recipient Sensitivity
```

Not every influence source uses every factor.

## 29. Proximity Influence

Social interaction probability shall be strongly affected by proximity:

```text
InteractionProbability =
    BaseProbability
    × ProximityModifier
    × SociabilityModifier
    × RelationshipModifier
    × ActivityModifier
```

People sharing a workplace should interact more frequently than random residents of the same city.

## 30. Activity Locations

Agents should eventually spend time at home, workplaces, schools, markets, farms, religious institutions, social venues, government buildings, roads, other households, and wilderness. Activity locations create encounter pools; continuous physical collision detection is not required.

## 31. Relationships

Suggested independent dimensions include familiarity, affection, trust, respect, fear, dependency, kinship, influence, and interaction frequency. A person may respect someone while disliking them; do not collapse every relation into one friendship score.

## 32. Relationship Formation

Formation should depend on interaction frequency and outcome, existing familiarity, trait compatibility, shared activities, shared groups, kinship, and geographic proximity.

## 33. Development

Long-term development shall be driven primarily through accumulated exposure and meaningful experience. Avoid continuously applying a community average directly to a person. Prefer:

```text
High-curiosity environment
  -> more exposure to exploration and learning
  -> more exploration opportunities
  -> positive/negative experiences
  -> developmental pressure
  -> slow trait/value change
```

## 34. Developmental Plasticity

Variable definitions should eventually support base, childhood, adolescent, adult, and late-life plasticity. Curiosity might have moderate childhood and low adult plasticity; authority trust may be highly plastic throughout life; fear may have very high short-term plasticity.

## 35. Child Development

A child's development should conceptually depend on inherited predisposition, random variation, parent behavior, household environment, peer environment, community environment, institutions, physical environment, and life experiences. No single input completely determines the resulting person.

## 36. Trait Inheritance

Inheritance provides starting predispositions, not fixed outcomes:

```text
StartingTrait =
    ParentalComponent
    + PopulationBaseline
    + RandomVariation
```

The formula shall be configurable. Do not hardcode unsupported real-world genetic assumptions. This is a fictional simulation system, not a claim of biological accuracy.

## 37. Significant Experiences

Structured experience events may include parent death, friendship formation, social rejection, public recognition, food scarcity, violence exposure, migration, successful exploration, educational success, institutional mistreatment, economic improvement, and natural disaster. Experiences should be structured events rather than narrative text.

## 38. Experience Interpretation

An experience shall not affect everyone identically:

```text
Experience
  -> Interpretation
  -> Traits + Values + Relationships + Beliefs
  -> Personal Effect
```

A successful dangerous journey may increase confidence and exploration preference for a curious, risk-tolerant person. The same journey with a negative outcome may increase threat sensitivity and reduce exploration for an anxious, risk-averse person.

## 39. Behavior System

Actions are selected from those currently available. Initial actions include Eat, Drink, Rest, Travel, Explore, Work, Socialize, Return Home, Seek Help, and Avoid. Later actions may include Trade, Teach, Study, Create, Organize, Protest, Fight, Migrate, Join Group, and Leave Group. Do not implement all future actions immediately.

## 40. Action Availability

Determine availability before calculating utility. Eat requires accessible food; Socialize requires an accessible social opportunity; Travel requires a reachable destination; Work requires a workplace or activity opportunity. Traits must not create impossible behavior.

## 41. Action Utility

Each available action receives a utility or propensity score:

```text
Explore Utility
Base                   0.10
Curiosity              +0.28
Novelty Seeking        +0.14
Risk Tolerance         +0.10
Nearby Unknown Area    +0.18
Hunger                 -0.24
Travel Danger          -0.13
Final Utility          0.43
```

The numeric model may evolve, but the engine shall retain enough diagnostic information to inspect the calculation.

## 42. Action Probability

Convert utilities into a probability distribution, then use seeded randomness to select the resolved action:

```text
Eat             42%
Explore         26%
Socialize       18%
Rest             9%
Move             5%
```

## 43. Reproducibility

All stochastic behavior uses controlled seeded RNG streams; random generation shall not be scattered through arbitrary modules. Record simulation run ID, engine version, world version, configuration version, and initial seed. Identical inputs shall produce identical output.

## 44. Community Emergence

Community social trust should derive from interpersonal trust, successful cooperation, relationship density, crime/betrayal, institutional effectiveness, and conflict. Do not simply label `average(person.trust)` as social trust; person-level trust may be one component.

## 45. Influence Weight by Social Importance

People need not contribute equally to community influence. Potential weights include social-network centrality, prestige, leadership role, wealth, institutional authority, expertise, reputation, and communication reach. A connected leader may influence local culture more than an isolated individual.

## 46. Feedback Loops

Feedback loops are expected and desirable, but they must remain inspectable.

## 47. Trust Loop

```text
Personal Trust
  -> Cooperation
  -> Successful Interaction
  -> Relationship Trust
  -> Community Social Trust
  -> Greater Cooperation Opportunity
```

The reverse may occur when betrayal or crime increases.

## 48. Curiosity and Innovation Loop

```text
Curiosity
  -> Exploration
  -> Knowledge Acquisition
  -> Experimentation
  -> Innovation
  -> Community Rewards Innovation
  -> Future Exploration Becomes More Attractive
```

## 49. Geographic Isolation Loop

```text
Difficult Geography
  -> Interaction Frequency Declines
  -> Outside Exposure Declines
  -> Local Networks Dominate
  -> Cultural Divergence
```

## 50. Inequality Loop

```text
Inequality
  -> Status Competition + Perceived Injustice
  -> Social Trust Declines
  -> Class Identity Increases
  -> Collective Political Behavior
```

Later political systems may consume this output. Do not implement political behavior solely for this document.

## 51. Childhood Feedback Loop

This is a central simulation loop:

```text
Current Community
  -> Childhood Environment
  -> Experiences
  -> Developing Person
  -> Adult Behavior
  -> Collective Community Behavior
  -> Future Community
  -> Next Generation
```

The implementation architecture must preserve it.

## 52. Trait Registry Architecture

Traits shall be data-driven. Avoid hardcoding `person.curiosity`, `person.empathy`, and `person.riskTolerance` throughout the engine. A conceptual definition is:

```json
{
  "id": "curiosity",
  "name": "Curiosity",
  "category": "cognitive",
  "minimum": 0,
  "maximum": 1,
  "defaultMean": 0.5,
  "defaultVariance": 0.12,
  "basePlasticity": 0.15,
  "childPlasticity": 0.35,
  "adultPlasticity": 0.08,
  "enabled": true
}
```

The exact schema shall follow repository conventions.

## 53. Variable Registry

The registry pattern may eventually extend beyond personality traits. Use explicit namespaces or equivalent typed identifiers to prevent ambiguity:

```text
person.trait.*
person.value.*
person.attitude.*
person.state.*
person.need.*
relationship.*
household.*
community.emergent.*
community.structural.*
environment.*
decision.*
action.*
```

## 54. Influence Registry

Influence relationships should be data-driven where practical:

```json
{
  "source": "person.trait.curiosity",
  "target": "decision.explore.utility",
  "weight": 0.35,
  "curve": "linear",
  "timeHorizon": "immediate"
}
```

```json
{
  "source": "community.structural.repression",
  "target": "person.state.fear",
  "weight": 0.28,
  "timeHorizon": "short"
}
```

```json
{
  "source": "community.structural.repression",
  "target": "person.attitude.authorityTrust",
  "weight": -0.17,
  "timeHorizon": "long",
  "requiresExposure": true
}
```

## 55. Initial Influence Matrix

This conceptual matrix guides implementation; it need not be completed in the first iteration. `+` means the source tends to increase the target and `-` means it tends to decrease it. Neither indicates social desirability.

| Source | Target | Direction |
|---|---|:---:|
| Curiosity | Exploration Utility | + |
| Curiosity | Information Seeking | + |
| Curiosity | Learning Exposure | + |
| Novelty Seeking | Exploration Utility | + |
| Novelty Seeking | Routine Preference | - |
| Risk Tolerance | Perceived Risk Cost | - |
| Risk Tolerance | Exploration | + |
| Risk Tolerance | Migration Willingness | + |
| Patience | Long-Term Utility Weight | + |
| Patience | Impulsive Action | - |
| Impulsivity | Immediate Reward Weight | + |
| Impulsivity | Planning | - |
| Persistence | Goal Continuation | + |
| Adaptability | Adjustment to Change | + |
| Anxiety Sensitivity | Threat Cost | + |
| Anxiety Sensitivity | Exploration Utility | - |
| Aggression | Conflict Utility | + |
| Threat Sensitivity | Defensive Utility | + |
| Optimism | Expected Benefit | + |
| Sociability | Interaction Seeking | + |
| Empathy | Helping Utility | + |
| Empathy | Harm Cost | + |
| Trust Propensity | Cooperation Utility | + |
| Conformity | Norm Compliance | + |
| Cooperativeness | Collective Action | + |
| Competitiveness | Status Competition | + |
| Dominance | Leadership Utility | + |
| Loyalty | Defection Cost | + |
| Generosity | Helping Utility | + |
| Approval Seeking | Reputation Weight | + |
| Independence | Norm Compliance | - |
| Independence | Autonomous Action | + |
| Forgiveness | Grievance Decay | + |
| Vindictiveness | Grievance Persistence | + |
| Pragmatism | Material Outcome Weight | + |
| Creativity | Novel Action Generation | + |
| Skepticism | Source Verification | + |
| Skepticism | Unverified Belief Adoption | - |
| Dogmatism | Belief Persistence | + |
| Intellectual Humility | Belief Updating | + |
| Planning Horizon | Future Reward Weight | + |
| Ambition | Achievement Utility | + |
| Status Seeking | Prestige Utility | + |
| Power Seeking | Leadership / Control Utility | + |
| Security Seeking | Safety Utility | + |
| Autonomy Seeking | Independence Utility | + |
| Belonging Need | Group Participation | + |
| Territorial Attachment | Migration Cost | + |
| Hunger | Food-Seeking Utility | + |
| Hunger | Exploration Utility | - |
| Fear | Threat Avoidance | + |
| Fear | Exploration | - |
| Anger | Retaliation | + |
| Stress | Impulsive Decisions | + |
| Stress | Cognitive Flexibility | - |
| Resentment | Opposition Utility | + |
| Contentment | Migration Utility | - |
| Loneliness | Social Utility | + |
| Desperation | Risk Cost | - |
| Social Trust | Cooperation Exposure | + |
| Social Cohesion | Belonging Reinforcement | + |
| Community Violence | Fear | + |
| Community Violence | Trust | - |
| Cultural Openness | Novelty Exposure | + |
| Cultural Conformity | Norm Pressure | + |
| Innovation Climate | Exploration Reward | + |
| Institutional Legitimacy | Authority Trust | + |
| Corruption | Institutional Trust | - |
| Repression | Fear | + |
| Repression | Open Dissent | - |
| Repression | Long-Term Resentment | + |
| Political Freedom | Autonomous Expression | + |
| Inequality | Perceived Injustice | + |
| Food Security | Desperation | - |
| Education Access | Learning Exposure | + |
| Literacy | Information Reach | + |
| Information Freedom | Information Diversity | + |
| Segregation | Out-Group Exposure | - |
| Population Density | Encounter Probability | + |
| Crime | Fear | + |
| Crime | Social Trust | - |
| Rule of Law | Institutional Trust | + |
| War Exposure | Fear | + |
| War Exposure | Stress | + |
| External Threat | Group Conformity | + |
| Trade Connectivity | External Exposure | + |
| Infrastructure | Effective Distance | - |
| Geographic Isolation | External Exposure | - |
| Geographic Isolation | Local Cultural Divergence | + |
| Resource Abundance | Security | + |
| Resource Scarcity | Competition Pressure | + |
| Resource Scarcity | Migration Utility | + |
| Agricultural Productivity | Food Security | + |
| Water Availability | Settlement Utility | + |
| Difficult Terrain | Effective Distance | + |
| Roads | Effective Distance | - |
| River Access | Trade / Travel Utility | + |
| Disaster Frequency | Threat Sensitivity Exposure | + |

## 56. Matrix Extensibility

Additional edges must be introducible without rewriting core simulation code. Long term, the project may contain 150–250 person variables, 50–100 community/environment variables, and 300–1,000 meaningful influence edges. Do not design around a complete pairwise matrix.

## 57. Interaction Effects

Some behavior cannot be adequately modeled as independent additive effects. Examples:

```text
Curiosity × Low Conformity
  -> stronger exploration of prohibited ideas

Curiosity × High Conformity
  -> stronger exploration of socially approved knowledge
```

```text
Perceived Injustice × Political Efficacy
  -> political participation
```

With extremely low political efficacy, perceived injustice may instead produce resentment, withdrawal, or migration rather than organized action.

## 58. Initial Interaction Terms

Do not implement a large interaction system immediately. Candidate early terms are Curiosity × Risk Tolerance, Sociability × Population Density, Trust × Relationship Familiarity, Conformity × Perceived Social Norm, Hunger × Resource Availability, and Threat Sensitivity × Local Danger. Keep interaction support extensible.

## 59. Action Explanation

Important actions should retain diagnostic information:

```json
{
  "action": "explore",
  "agentId": "person-128",
  "baseUtility": 0.1,
  "modifiers": [
    { "source": "curiosity", "value": 0.78, "effect": 0.24 },
    { "source": "riskTolerance", "value": 0.61, "effect": 0.09 },
    { "source": "hunger", "value": 0.81, "effect": -0.22 }
  ],
  "finalUtility": 0.21
}
```

This detail need not be persisted forever for every agent. It should be available in debug mode, for selected agents, for significant actions, and in development/testing scenarios.

## 60. Development Explanation

For important developmental changes, preserve contributing factors:

```text
Authority Trust
Previous: 0.64
Current:  0.51

Primary Contributors
Government assistance      +0.04
Parent imprisonment        -0.11
Peer attitudes             -0.03
Local corruption exposure  -0.03
```

This capability may initially exist only as debug information.

## 61. Community Explanation

The application should eventually explain community values:

```text
Stonehaven Social Trust: 0.61

Contributing Factors
Successful cooperation       +0.11
Dense social relationships   +0.08
Stable food supply            +0.05
Recent theft increase         -0.04
Political corruption         -0.07
```

The engine should retain enough aggregate information to support this.

## 62. Update Frequencies

Not every system executes hourly.

| System | Cadence |
|---|---|
| Immediate Needs | Hourly |
| Activity Selection | Hourly |
| Movement | Hourly |
| Encounters | Hourly |
| Short-Term States | Hourly |
| Relationship Aggregation | Daily |
| Resource Consumption | Daily |
| Household Conditions | Daily |
| Community Statistics | Daily or weekly |
| Attitude Development | Weekly or event-driven |
| Trait Development | Monthly or event-driven |
| Cultural Aggregation | Monthly |
| Generational Analysis | Yearly |

Event scheduling may optimize this later.

## 63. Data Persistence

Do not persist every computed modifier at every tick. Separate:

- **Current state:** persistent authoritative state.
- **Significant events:** persistent history.
- **Aggregated statistics:** periodically sampled data.
- **Debug traces:** temporary or selectively persisted diagnostics.

This distinction is necessary for long-running simulations.

## 64. Required Initial Implementation Scope

Do not attempt the entire matrix immediately. Prove the architecture with approximately 5–10 person traits, 3–5 current states, 3–5 actions, 5–10 influence edges, 2–3 environmental variables, basic social encounters, and basic action explanation.

Recommended initial subset:

- Traits: Curiosity, Risk Tolerance, Sociability, Trust, Conformity, Persistence.
- States/needs: Hunger, Fatigue, Social Need.
- Environment: Food Availability, Terrain Movement Cost, Population Density.
- Actions: Eat, Rest, Explore, Travel, Socialize.

## 65. Initial Validation Scenario

Create two populations with statistically equivalent starting traits.

**Settlement A:** dense, central food source, high encounter frequency, short travel distances.

**Settlement B:** dispersed, distributed food, low encounter frequency, longer travel distances.

Run multiple seeds and measure average interactions per person/day, relationship count, travel distance, food access, exploration frequency, and social-network density. Geography should produce observable differences despite similar starting populations.

## 66. Trait Validation Scenario

Create groups differing primarily in one trait: Group A curiosity mean `0.75`; Group B curiosity mean `0.25`; other distributions equivalent. Across many seeds, Group A should explore more often. Never test a stochastic tendency using one seed.

## 67. Influence Tests

Each edge should be independently testable. Given identical agents, world state, and available actions except that Agent A has curiosity `0.8` and Agent B has curiosity `0.2`, Agent A's Explore utility should be greater.

## 68. Statistical Tests

Use repeated simulation for probabilistic behavior. For example, across 10,000 decisions, high-curiosity agents should select Explore at a statistically higher rate than low-curiosity agents, within reasonable tolerance.

## 69. Reproducibility Tests

Given Initial State A, seed `12345`, and engine version X, run 1,000 ticks and save output. Recreate the same inputs and run again; state and event output must match.

## 70. Invariant Tests

Required invariants include:

- Trait values remain within legal bounds.
- Probabilities remain valid.
- An agent cannot occupy two locations simultaneously.
- Unavailable actions cannot be selected.
- A person cannot interact with themselves.
- Food cannot be consumed below zero.
- Identical simulation inputs produce identical outcomes.

## 71. Performance Guidance

Prioritize correctness, explainability, testability, and observability before large-scale optimization. Do not prematurely optimize for millions of agents. However:

- Avoid O(N²) global person comparisons.
- Use geographic partitioning for encounters.
- Query nearby people from cells or activity locations.
- Keep influence graphs sparse.
- Avoid recalculating static modifiers unnecessarily.
- Allow systems to update at different cadences.

## 72. Architectural Boundaries

Keep trait definitions, person-variable state, influence definitions, decision evaluation, stochastic resolution, action execution, experience generation, development, community aggregation, environment, statistics, and persistence separable. Do not allow every module to directly modify arbitrary traits; changes flow through controlled system boundaries.

## 73. Recommended Processing Pattern

A simulation interval should conceptually:

1. Read current state.
2. Update immediate physical states.
3. Determine current activity and environmental exposure.
4. Determine available actions.
5. Evaluate action utility.
6. Convert utility to a probability distribution.
7. Resolve using seeded RNG.
8. Execute actions.
9. Resolve encounters.
10. Produce experiences and events.
11. Apply short-term state changes.
12. Accumulate developmental exposure.
13. Update relationships when scheduled.
14. Update longer-term attitudes and traits when scheduled.
15. Aggregate community statistics when scheduled.
16. Persist significant events and statistics.

## 74. Codex Implementation Instructions

When implementing this specification:

- Inspect the repository before making architectural assumptions.
- Follow existing project conventions where reasonable.
- Keep the simulation engine independent of the frontend.
- Keep RNG centralized and reproducible.
- Implement traits through a registry instead of growing database columns or hardcoded fields.
- Implement influences through sparse explicit edges.
- Do not implement every relationship in this document immediately.
- Start with the smallest subset that validates the architecture.
- Add automated tests with every trait, influence, action, or system.
- Do not add generative AI or LLM dependencies.
- Do not create opaque behavioral logic that cannot be explained.
- Avoid magic numbers scattered through application code.
- Put coefficients in centralized configuration or registries.
- Prefer explicit units and normalized values.
- Document equations and normalization behavior.
- Preserve fixed-seed reproducibility.
- Keep environment, society, traits, temporary states, and learned attitudes semantically separate.
- Challenge complexity that does not help validate the core simulation hypothesis.

## 75. Initial Implementation Objective

The first implementation succeeds when it demonstrates:

```text
Different People
  + Different Traits
  + Different Geographic Exposure
  + Different Social Interaction
  + Seeded Probability
  -> Different Individual Behavior
  -> Measurable Population-Level Differences
```

The next major milestone extends this to:

```text
Individual Behavior
  -> Community Environment
  -> Childhood Exposure
  -> Development
  -> Different Adults
  -> Changed Community Environment
```

That bidirectional relationship between individual development and emergent community conditions is the long-term foundation of the simulation engine.
