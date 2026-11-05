import { validatePart } from '../lib/reading.ts'
import type { Exam, Part, Question, Skill } from '../lib/types.ts'

function question(prompt: string, options: string[], answer: number, skill: Skill, evidence: string | string[], explanation: string): Question {
  return { prompt, options, answer, skill, evidence: typeof evidence === 'string' ? [evidence] : evidence, explanation }
}

const parts: Part[] = [
  {
    index: 0,
    title: 'A change of plans at the seed swap',
    visual: null,
    paragraphs: [
      'Hi Anika,',
      'I went by the community centre yesterday to check on the folding tables for Saturday’s seed swap. The custodian told me that the north hall, where we met last spring, is getting a new floor. We can use the smaller room beside the kitchen for the morning, but a dance class takes it over at noon. I’ve asked the library about its meeting room for the afternoon. They’ll let me know by Thursday.',
      'Either way, let’s keep the public hours at nine to eleven thirty. That leaves us half an hour to pack up. If the library comes through, we could hold the volunteer lunch there instead of squeezing it in between visitors. I already told the bakery to drop the sandwiches off at the community centre at eleven. I can carry them across myself, so please leave the order as it is.',
      'Could you revise the poster before Friday? The notice board by the parking lot is being replaced, so the entrance by the bus stop is the only place we should put it. I’d also add a line saying people can come even if they have nothing to exchange. Last year a few new gardeners stood at the door until I went over and invited them in. I’d like them to feel welcome from the start this time.',
      'As for the tables, the centre has six, but only four fit safely in the room once we leave a path to the kitchen. Put the seed packets on three and keep the fourth clear for labelling and sorting. If you can find a volunteer to greet people, I’ll be able to stay at that table. I’m happy to welcome visitors when I can, but explaining how to store the seeds took more of my time last year than I expected.',
      'Thanks,\nMira',
    ],
    followup: 'Hi Mira,\n\nI’ll update the poster so visitors know that {{7}}. I’ll put it {{8}}. I’ll leave the bakery order alone because {{9}}. I can ask Theo to {{10}}, which should give you time to {{11}}.\n\nAnika',
    questions: [
      question('Why can’t the group use its room from last year?', ['The tables have been removed.', 'A dance class has reserved it.', 'Work is being done on the floor.', 'The library has taken over the space.'], 2, 'paraphrase', 'the north hall, where we met last spring, is getting a new floor', 'The north hall is their old venue and is undergoing renovation. The dance class has the temporary room at noon.'),
      question('Which detail does Mira expect to confirm by Thursday?', ['Whether the bakery will deliver', 'Whether the library room is available', 'Whether the hall will be finished', 'Whether the public hours can be extended'], 1, 'detail', 'I’ve asked the library about its meeting room for the afternoon. They’ll let me know by Thursday.', 'Thursday is when Mira expects an answer from the library.'),
      question('Why does the swap close at eleven thirty?', ['To give the group time to clear the room', 'To allow the custodian to open the hall', 'To serve lunch to visitors', 'To catch the next bus to the library'], 0, 'purpose', 'That leaves us half an hour to pack up.', 'The room changes hands at noon, so the group needs the final half hour to pack.'),
      question('What did Mira notice at the previous swap?', ['The kitchen walkway became blocked.', 'The bakery delivered too late.', 'Experienced gardeners left early.', 'Some beginners hesitated to enter.'], 3, 'paraphrase', 'a few new gardeners stood at the door until I went over and invited them in', 'Standing at the door until invited suggests the beginners were unsure whether they could join.'),
      question('What limits the number of tables they can set up?', ['Only four tables are available.', 'A walkway needs to stay open.', 'Two tables have been lent to the library.', 'The kitchen needs two tables for lunch.'], 1, 'detail', 'only four fit safely in the room once we leave a path to the kitchen', 'There are six tables available. The limit comes from keeping access to the kitchen clear.'),
      question('How does Mira feel about greeting visitors?', ['She wants to be the only greeter.', 'She thinks it distracted visitors last year.', 'She is willing but has another job to do.', 'She believes the new poster replaces the greeter.'], 2, 'tone', 'I’m happy to welcome visitors when I can, but explaining how to store the seeds took more of my time last year than I expected.', 'She is willing to greet people when free. She anticipates needing time to explain seed storage.'),
      question('', ['the event lasts all afternoon', 'only volunteers can bring seeds', 'bringing seeds is optional', 'the event is at the library'], 2, 'paraphrase', 'people can come even if they have nothing to exchange', 'The new line should make clear that everyone can attend, including visitors with nothing to trade.'),
      question('', ['on the parking lot notice board', 'by the bus-stop entrance', 'in the library meeting room', 'on the kitchen door'], 1, 'detail', 'the entrance by the bus stop is the only place we should put it', 'Mira chooses the bus-stop entrance because the other board is being replaced.'),
      question('', ['the library has confirmed lunch', 'the sandwiches can arrive after noon', 'Theo can pick up lunch at the bakery', 'you can move the sandwiches if lunch changes venues'], 3, 'inference', 'I can carry them across myself, so please leave the order as it is.', 'Delivery stays at the community centre even if the volunteers eat at the library.'),
      question('', ['welcome people at the door', 'move lunch to the library at nine', 'reopen the north hall', 'call the bakery on Friday'], 0, 'purpose', 'If you can find a volunteer to greet people, I’ll be able to stay at that table.', 'Theo would fill the greeting role Mira asked Anika to find someone for.'),
      question('', ['take down the parking lot board', 'move tables out of the kitchen', 'help visitors with their seeds', 'walk visitors to the dance class'], 2, 'inference', 'explaining how to store the seeds took more of my time last year than I expected', 'A separate greeter lets Mira stay at the sorting table and answer visitors’ questions.'),
    ],
  },
  {
    index: 1,
    title: 'Weekend repair workshops',
    paragraphs: [],
    visual: {
      heading: 'Westbank Repair Café',
      subtitle: 'Learn to fix it. Saturday and Sunday workshops at the Cedar Street studio.',
      columns: ['Workshop', 'When', 'Fee', 'Who can join'],
      rows: [
        ['Bike basics', 'Sat 10:00–11:30', '$18', 'Ages 14+ · Beginners'],
        ['Clothing repairs', 'Sat 13:00–14:30', '$16', 'Ages 12+ · Beginners'],
        ['Small appliance care', 'Sun 10:00–12:00', '$24', 'Adults · Beginners'],
        ['Advanced sewing', 'Sun 13:00–15:00', '$20', 'Ages 16+ · Prior experience'],
      ],
      note: 'Fees are per person and include tools and supplies. Participants under 16 must attend with a registered adult. Online registration closes Thursday at 6 p.m. Spaces may be transferred to another person until Friday at noon.',
    },
    followup: 'Hi Leo,\n\nYour thirteen-year-old niece could join us for {{1}}. She’d be allowed to attend as long as {{2}}. It would cost {{3}} for the three of us, including supplies. We should register by {{4}}. If my shift changes, I can {{5}}.\n\nPriya',
    questions: [
      question('', ['Bike basics', 'Clothing repairs', 'Small appliance care', 'Advanced sewing'], 1, 'constraints', ['Clothing repairs', 'Ages 12+ · Beginners'], 'Clothing repairs is the only workshop whose age requirement includes a thirteen-year-old.'),
      question('', ['she brings her own tools', 'she has taken a class before', 'a registered adult attends with her', 'she arrives with a permission slip'], 2, 'detail', 'Participants under 16 must attend with a registered adult.', 'Her age meets the workshop minimum, but the under-16 attendance rule also applies.'),
      question('', ['$48', '$16', '$54', '$60'], 0, 'constraints', ['$16', 'Fees are per person'], 'Three participants at $16 each cost $48. Supplies are included.'),
      question('', ['Friday at noon', 'Saturday at 10 a.m.', 'Sunday at noon', 'Thursday at 6 p.m.'], 3, 'detail', 'Online registration closes Thursday at 6 p.m.', 'The Friday deadline is for transferring an existing reservation. Thursday at 6 p.m. is for registration.'),
      question('', ['attend the next class with the same ticket', 'give my place to someone else before Friday noon', 'ask for a refund on Saturday', 'send the studio my tools instead'], 1, 'paraphrase', 'Spaces may be transferred to another person until Friday at noon.', 'Priya can transfer her space to someone else by the transfer deadline.'),
      question('What is Priya mainly doing in the email?', ['Asking the studio to lower its fees', 'Giving feedback on a class she attended', 'Proposing a workshop her group can attend', 'Requesting a new workshop for children'], 2, 'purpose', ['Clothing repairs', 'Ages 12+ · Beginners'], 'Priya suggests a specific class, checks eligibility, and works out how the group could register.'),
      question('Which workshop is open to an inexperienced adult who is free only on Sunday afternoon?', ['Advanced sewing', 'Small appliance care', 'Clothing repairs', 'None of the listed workshops'], 3, 'constraints', ['Sun 13:00–15:00', 'Ages 16+ · Prior experience', 'Sun 10:00–12:00'], 'The Sunday afternoon option requires experience. The Sunday beginner option ends at noon.'),
      question('Why might Priya need to transfer her place?', ['She may have a work conflict.', 'Leo might turn sixteen.', 'She might need to lend her tools.', 'The workshop could move to Sunday.'], 0, 'inference', 'Spaces may be transferred to another person until Friday at noon.', 'Priya’s reference to a possible shift change points to a work conflict. The flyer explains what she can do if that happens.'),
    ],
  },
  {
    index: 2,
    title: 'The first year of a seed library',
    visual: null,
    paragraphs: [
      'When a branch library in Bellhaven set up a seed cabinet, the staff borrowed an old map drawer from a municipal archive. The drawers were shallow enough to keep packets in a single layer, which mattered more than having a display people could see across the room. The cabinet was placed just past the returns desk so that visitors could find it without having to ask. During the first spring, people took more bean seeds than any other kind, though the staff had expected flowers to be the most popular choice.',
      'The scheme operates on an honour system. Visitors write down the variety and the number of packets they take, but their library card is never scanned. Borrowers are encouraged to bring back seeds if their plants produce enough. Return envelopes ask where the plants grew and whether other varieties flowered nearby. The information helps volunteers decide if the next batch is likely to grow true to type. It also means a packet can be accepted even if the volunteer has never heard of the variety.',
      'During the summer the volunteers kept a record of germination complaints. Several packets labelled as the same variety produced different results. The original seed donations had been stored in different households, and the records were too incomplete to show whether age or storage conditions were responsible. Rather than throwing away everything with that label, the team tested a small number from each remaining batch on damp paper. Batches that sprouted poorly were removed from circulation.',
      'The programme will have a smaller budget next year because its launch grant paid for one-time equipment. The library board agreed to cover the cost of paper envelopes and signs, but rejected a proposal to pay for a dedicated coordinator. A horticulture club volunteered to train a second group of people to do intake. The staff hope the extra help will let them open the cabinet during evening events without asking the same volunteers to work every shift.',
    ],
    followup: '',
    questions: [
      question('One category of seed was more popular than the organisers anticipated relative to another.', [], 0, 'matching', 'people took more bean seeds than any other kind, though the staff had expected flowers to be the most popular choice', 'Paragraph A contrasts the staff’s prediction about flowers with the demand for beans.'),
      question('Members can borrow seeds without having their borrowing account updated.', [], 1, 'paraphrase', 'their library card is never scanned', 'Paragraph B explains that seed borrowing is logged separately from an individual library account.'),
      question('Staff concluded that high storage temperatures caused the problems with germination.', [], 4, 'matching', 'the records were too incomplete to show whether age or storage conditions were responsible', 'The passage describes possible causes and says the records could not distinguish them. It gives no conclusion about temperature.'),
      question('The programme received an offer to prepare more people for a volunteer role.', [], 3, 'matching', 'A horticulture club volunteered to train a second group of people to do intake.', 'The offer to train new intake volunteers appears in paragraph D.'),
      question('A feature of the furniture kept the contents from being stacked.', [], 0, 'paraphrase', 'The drawers were shallow enough to keep packets in a single layer', 'The shallow depth of the map drawers is described in paragraph A.'),
      question('Volunteers decided what to keep by checking samples rather than rejecting a whole variety.', [], 2, 'matching', 'the team tested a small number from each remaining batch on damp paper', 'Paragraph C explains that batches of the same named variety were tested separately.'),
      question('Borrowers must replace each packet they take before they can take another.', [], 4, 'matching', 'Borrowers are encouraged to bring back seeds if their plants produce enough.', 'A voluntary return is encouraged. The passage gives no rule linking a return to future borrowing.'),
      question('The library approved some ongoing expenses but refused to fund a position.', [], 3, 'paraphrase', 'The library board agreed to cover the cost of paper envelopes and signs, but rejected a proposal to pay for a dedicated coordinator.', 'Paragraph D distinguishes approved supplies from the rejected coordinator position.'),
      question('The library asks for information about nearby plants when people donate seeds.', [], 1, 'matching', 'Return envelopes ask where the plants grew and whether other varieties flowered nearby.', 'Paragraph B describes what the return envelopes ask about neighbouring varieties.'),
    ],
  },
  {
    index: 3,
    title: 'Should the last bus leave later?',
    visual: null,
    paragraphs: [
      'When the regional transit board considered extending Route 6 by two hours on Friday and Saturday nights, the proposal looked modest. It added no stops and required only one bus. But that bus would have to leave the transfer terminal after the final trips on several other routes had already departed. The debate at Tuesday’s meeting was less about whether people travel late than about what they can do once they reach the terminal.',
      'Elise Chen, who represents hospitality workers, argued that even an imperfect extension would matter. Several of her members can walk home from a Route 6 stop if they get that far. At present they are paying for rides for the whole journey after closing. Chen said she would support a three-month trial, provided it was advertised at workplaces as well as online. She worried that a trial nobody knew about would produce low ridership and be treated as proof that the service was unnecessary.',
      'Board member Paul Nadeau accepted that late shifts leave some workers stranded, but said the route had been chosen because it was cheap to extend. He pointed to cleaners at the hospital, which is served by a route that would still finish early. If extra operating funds were available, he would spend them coordinating one later departure across several routes, even if that meant running it on just one night a week. A timetable with fewer evenings, he argued, could still serve more people per evening.',
      'Operations manager Jaya Gill warned that a coordinated departure involves more than changing the timetable. A late bus from one route can hold up other buses if drivers are asked to wait for transfers. Gill suggested measuring missed connections as well as the number of passengers, regardless of which plan goes ahead. She also proposed talking to workers who already use taxis, since the people most affected might be absent from current passenger counts.',
      'The board postponed its vote until it could see estimates for both plans. The discussion exposed a choice that passenger totals alone are unlikely to settle. A small extension could make a real difference to people who live near Route 6. Its value to others depends on whether they can finish the rest of their trip.',
    ],
    followup: 'I work on Fridays and can walk from a Route 6 stop. I’d welcome a trial, but Chen is right that an announcement {{6}} may miss some of the workers it’s meant to reach. I also see why Nadeau would accept {{7}} if the buses gave people more ways to get home on that night. Gill’s point about {{8}} seems important for judging whether riders can actually complete the journey. We should also seek out people who {{9}} before deciding the present counts show the full demand. To me, the article suggests that a busy bus is {{10}}.',
    questions: [
      question('What practical concern frames the debate?', ['The price of replacing the terminal', 'A reduction in the number of stops', 'The availability of onward connections', 'A shortage of buses during the day'], 2, 'purpose', 'the final trips on several other routes had already departed', 'The central concern is whether people arriving at the terminal can continue their journeys.'),
      question('What could undermine the trial in Chen’s view?', ['A publicity gap that depresses ridership', 'New fares that make it more costly than taxis', 'Changing the route during the trial', 'Measuring demand over an entire season'], 0, 'viewpoint', 'a trial nobody knew about would produce low ridership and be treated as proof that the service was unnecessary', 'Chen fears low awareness will be mistaken for low demand.'),
      question('Why does Nadeau mention hospital cleaners?', ['To show that many already use Route 6', 'To argue that cleaning shifts should end earlier', 'To propose moving the transfer terminal', 'To identify workers the extension would leave out'], 3, 'inference', 'cleaners at the hospital, which is served by a route that would still finish early', 'The cleaners illustrate an unmet need on a route outside the extension.'),
      question('What trade-off does Nadeau prefer?', ['More service on Route 6 with fewer stops', 'Fewer nights with better connections on those nights', 'More evenings without holding any connecting buses', 'Lower fares in place of extending hours'], 1, 'viewpoint', 'coordinating one later departure across several routes, even if that meant running it on just one night a week', 'He accepts fewer service nights in exchange for connections across more routes.'),
      question('How does the writer present the decision?', ['As an obvious case for Nadeau’s plan', 'As an argument over how to calculate ticket prices', 'As a choice shaped by whose journeys each plan serves', 'As a minor disagreement over the release of a timetable'], 2, 'tone', ['A small extension could make a real difference to people who live near Route 6.', 'Its value to others depends on whether they can finish the rest of their trip.'], 'The ending gives weight to the extension’s local benefits and to the needs of people making transfers.'),
      question('', ['posted only online', 'made at several workplaces', 'explaining a fare increase', 'given at both the terminal and workplaces'], 0, 'viewpoint', 'provided it was advertised at workplaces as well as online', 'The commenter agrees with Chen that online coverage alone may miss workers.'),
      question('', ['a shorter route', 'service on fewer nights', 'higher transfer fares', 'a longer walk to the terminal'], 1, 'paraphrase', 'even if that meant running it on just one night a week', 'Nadeau is prepared to run the later service on fewer nights to improve coverage on those nights.'),
      question('', ['replacing older buses', 'advertising the trial', 'counting missed connections', 'running two buses on the same route'], 2, 'viewpoint', 'measuring missed connections as well as the number of passengers', 'Gill specifically proposes tracking missed transfers as a separate outcome.'),
      question('', ['never work late', 'already drive buses', 'live beside the terminal', 'currently rely on taxis'], 3, 'inference', 'talking to workers who already use taxis', 'Taxi users may need the service but are missing from the transit passenger counts.'),
      question('', ['enough evidence that all riders are well served', 'only one sign of a useful service', 'proof that another route should be cut', 'a reason to drop the trial'], 1, 'viewpoint', 'a choice that passenger totals alone are unlikely to settle', 'A full bus indicates some demand. The article also asks whether the wider network lets riders complete their journeys.'),
    ],
  },
]

export const starter: Exam = {
  id: 'starter-v1',
  title: 'The neighbourhood edition',
  origin: 'starter',
  parts: parts.map((part, index) => validatePart(part, index)),
}
