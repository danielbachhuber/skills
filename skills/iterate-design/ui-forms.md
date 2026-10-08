# UI forms by job

A catalog of forms to consider in step 3 of iterate-design. Find each job the design has to do, and consider every form in that section before picking the ones to show. Most designs do two or three jobs, such as showing a value and prompting an action.

Each form lists when it fits and what it costs.

## Where it can live

Combine any form below with a location. The same badge reads differently in a list row, a page header, and a notification.

| Location | Fits when | Costs |
| --- | --- | --- |
| Inline, next to the thing it describes (row, card, field) | The value belongs to one item and the user is already looking at that item | Little room; adds noise to every item |
| Header or toolbar of the current screen | It describes the whole screen, or should be visible while working | Competes with existing controls; often narrow |
| Banner above the main work area | Something needs attention now, in this context | Pushes content down; easy to tune out if shown too often |
| Section on an existing page | It extends what the page already answers | Page grows longer; must earn its position in the order |
| New page or tab | It answers a question nothing else answers, and needs room | Has to be remembered and visited |
| Detail view reached by a click (sub-page, drawer, popover, expanded row) | Most users need the summary; some need the detail | Hidden until clicked |
| Menu bar, status bar, or app icon badge | It should be visible from anywhere, at a glance | Very little room: a number, a color, or an icon |
| Toast or notification | An event happened that the user should know about once | Interrupts; disappears |
| Email, message, or digest | The moment is on a schedule, or the user isn't in the app | Delayed; separate from where the action happens |
| Command-line or log output | The user works in a terminal | Text only |

## Showing one value

| Form | Fits when | Costs |
| --- | --- | --- |
| Plain text in an existing line ("48 turns · 510K context") | The value is secondary and should cost nothing to add | Easy to miss |
| Bold or colored text | The value matters only past a threshold | Needs a rule for when it changes |
| Badge or pill | A state or category, not a quantity | Badges multiply and lose meaning |
| Row or card tint, with a colored edge | A few items need attention among many | One color per meaning across the whole product |
| Large number tile | The value is the headline of the screen | Takes a lot of space for one number |
| Tile with change from the previous period | The trend matters more than the level | Needs a comparison period the user agrees with |
| Meter or progress bar | The value has a natural maximum or a threshold | Misleading without a real maximum |
| Ring or gauge | A tiny space must show how full something is | Hard to read precisely |
| Sparkline beside the number | The recent shape matters as much as the current value | Unreadable without context; no axis |
| Icon only | Space is extremely tight and the meaning is well known | Ambiguous; needs a tooltip |

## Comparing values across items

| Form | Fits when | Costs |
| --- | --- | --- |
| Sorted table | The user will scan, sort, and look things up | Dense; weak at showing shape |
| Bar chart, sorted | Ranking matters | Implies a ranking, which may not be wanted for people |
| Bar chart, alphabetical or fixed order | Items should be findable, not ranked | Harder to see the extremes |
| Small multiples, one small chart per item | Each item's shape over time matters | Shared scale flattens small items; separate scales hide size |
| Paired values per item ("148 requested · 241 given") | Two related counts that aren't a fraction | Needs careful labels |
| Dot or strip plot, one dot per item | The spread and the outliers matter | Less familiar to some readers |
| Distribution with percentile marks (median, p75, p90) | Durations or sizes with a long tail | Needs a sentence of explanation the first time |
| Heat map (items by time or by category) | Two dimensions at once, many items | Color is imprecise |
| Scatter plot | The relationship between two measures | Hard to read for a general audience |
| Grouped list ("needs attention" above the rest) | A few items need attention among many | Splits the list; items move between groups |

## Showing change over time

| Form | Fits when | Costs |
| --- | --- | --- |
| Line, one or a few series | Trend over a continuous period | Too many lines become unreadable |
| Line with a band (median with p25 to p75) | Trend of a typical value plus its spread | More to explain |
| Bars per period | Counts per week or day | Busy at fine granularity |
| Stacked bars or stacked area | The parts of a total over time | Only the bottom layer is easy to compare |
| One bar per event (per turn, per release) | Events are uneven in time | Loses calendar time |
| Before and after, with a marked date | Testing whether a change made a difference | Needs a clear start date |
| Cumulative line | Progress toward a total, or growth of a backlog | Hides week-to-week variation |
| Period selector (6 weeks, 12 weeks, 1 year) | Users need both recent and long views | Every chart must regroup sensibly at each length |

## Showing a flow or a process

| Form | Fits when | Costs |
| --- | --- | --- |
| Stage strip (chevrons with counts) | Where work is piling up right now | Hides time spent |
| Times on the arrows between stages | Handoff delays are the question | Hides how much work is in each stage |
| Stages grouped under named phases | The process has a published vocabulary to match | Takes vertical space |
| Funnel or volume bars per stage, with exits | Loss or rework between stages matters | Weak at showing order |
| Aging chart, one dot per open item by time in stage | What to unblock today | Only covers open work |
| Per-item stage breakdown (one bar per item, split by stage) | Explaining why some items took long | Many rows |
| Cumulative flow | Which stage's queue is growing over weeks | Needs a long history to read |
| Loop arrow with a count | Work going back a stage (rework) | Adds visual complexity |

## Prompting an action

| Form | Fits when | Costs |
| --- | --- | --- |
| One-line strip with the reason and a button | The action is obvious once the reason is stated | Little room to explain |
| Card with a short explanation and two buttons (do it, not now) | The user needs to understand why before acting | Takes space; must be dismissable |
| Meter with a threshold and a button | The action fixes a value that is climbing | Needs a meaningful maximum |
| Button on the flagged row itself | The user handles several items from a list | Clutters rows |
| Suggested default (pre-filled, one click to accept) | The right choice is usually predictable | Users may accept without reading |
| Undo after an automatic action | The action is safe to do automatically | The user may not notice it happened |

For any action, decide what happens when it can't run right now (disabled with a reason, or queued), and what the user sees after it succeeds.

## Navigating and handling volume

| Form | Fits when | Costs |
| --- | --- | --- |
| Paging (25 at a time, "1 to 25 of 118") | Long lists the user browses | Hides the total shape |
| "Show more" | Most users need only the first few | Long pages after several clicks |
| Filter or search | Users look for specific items | Needs a clear empty result |
| Click-through to a detail page (an item, a person) | Each item has its own story | Back navigation must keep state |
| Callout sentence linking to the items it names ("2 threads used 588M of 699M") | A pattern should be stated directly | Needs care to stay accurate |
| Empty state with the next step | Nothing to show yet | Easy to forget to design |
