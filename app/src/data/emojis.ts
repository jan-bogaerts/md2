export type EmojiGroupId = 'activities' | 'flags' | 'food' | 'nature' | 'objects' | 'people' | 'smileys' | 'symbols' | 'travel'

export interface Emoji {
    char: string
    group: EmojiGroupId
    keywords: readonly string[]
    name: string
}

export interface EmojiGroup {
    id: EmojiGroupId
    label: string
}

/** Display order of the emoji picker sections. */
export const EMOJI_GROUPS: readonly EmojiGroup[] = Object.freeze([
    { id: 'smileys', label: 'Smileys & emotion' },
    { id: 'people', label: 'People & body' },
    { id: 'nature', label: 'Animals & nature' },
    { id: 'food', label: 'Food & drink' },
    { id: 'travel', label: 'Travel & places' },
    { id: 'activities', label: 'Activities' },
    { id: 'objects', label: 'Objects' },
    { id: 'symbols', label: 'Symbols' },
    { id: 'flags', label: 'Flags' },
])

// Rows are `char|name|space-separated keywords`, one emoji per line.
const SMILEYS = `
😀|grinning face|smile happy
😃|grinning face with big eyes|smile happy joy
😄|grinning face with smiling eyes|smile happy laugh
😁|beaming face with smiling eyes|grin happy
😆|grinning squinting face|laugh satisfied
😅|grinning face with sweat|nervous relief
🤣|rolling on the floor laughing|lol rofl laugh
😂|face with tears of joy|laugh lol cry
🙂|slightly smiling face|smile
🙃|upside-down face|silly sarcasm
🫠|melting face|hot embarrassed
😉|winking face|wink flirt
😊|smiling face with smiling eyes|blush happy
😇|smiling face with halo|angel innocent
🥰|smiling face with hearts|love adore
😍|smiling face with heart-eyes|love crush
🤩|star-struck|excited wow
😘|face blowing a kiss|kiss love
😗|kissing face|kiss
☺️|smiling face|smile relaxed
😚|kissing face with closed eyes|kiss
😙|kissing face with smiling eyes|kiss
🥲|smiling face with tear|grateful proud
😋|face savoring food|yum delicious
😛|face with tongue|tongue playful
😜|winking face with tongue|crazy joke
🤪|zany face|goofy crazy
😝|squinting face with tongue|tongue gross
🤑|money-mouth face|money rich
🤗|smiling face with open hands|hug
🤭|face with hand over mouth|oops giggle
🫢|face with open eyes and hand over mouth|shock surprise
🫣|face with peeking eye|peek scared
🤫|shushing face|quiet secret
🤔|thinking face|think hmm
🫡|saluting face|salute respect
🤐|zipper-mouth face|secret silent
🤨|face with raised eyebrow|skeptic doubt
😐|neutral face|meh blank
😑|expressionless face|blank
😶|face without mouth|silent
🫥|dotted line face|invisible hidden
😶‍🌫️|face in clouds|foggy absent
😏|smirking face|smirk smug
😒|unamused face|meh annoyed
🙄|face with rolling eyes|eyeroll
😬|grimacing face|awkward
😮‍💨|face exhaling|sigh relief
🤥|lying face|lie pinocchio
🫨|shaking face|shock vibrate
😌|relieved face|calm relief
😔|pensive face|sad
😪|sleepy face|tired
🤤|drooling face|drool
😴|sleeping face|sleep zzz
😷|face with medical mask|sick mask
🤒|face with thermometer|sick fever
🤕|face with head-bandage|hurt injured
🤢|nauseated face|sick gross
🤮|face vomiting|sick vomit
🤧|sneezing face|sick sneeze
🥵|hot face|heat sweat
🥶|cold face|freezing
🥴|woozy face|dizzy drunk
😵|face with crossed-out eyes|dizzy dead
😵‍💫|face with spiral eyes|dizzy hypnotized
🤯|exploding head|mind blown shocked
🤠|cowboy hat face|cowboy
🥳|partying face|party celebration
🥸|disguised face|disguise incognito
😎|smiling face with sunglasses|cool
🤓|nerd face|geek
🧐|face with monocle|inspect curious
😕|confused face|confused
🫤|face with diagonal mouth|unsure skeptical
😟|worried face|worry
🙁|slightly frowning face|sad
☹️|frowning face|sad
😮|face with open mouth|surprise wow
😯|hushed face|surprise
😲|astonished face|shock amazed
😳|flushed face|embarrassed
🥺|pleading face|puppy eyes please
🥹|face holding back tears|touched grateful
😦|frowning face with open mouth|shock
😧|anguished face|pain
😨|fearful face|scared fear
😰|anxious face with sweat|nervous
😥|sad but relieved face|phew
😢|crying face|sad tear
😭|loudly crying face|sob cry
😱|face screaming in fear|scream horror
😖|confounded face|frustrated
😣|persevering face|struggle
😞|disappointed face|sad
😓|downcast face with sweat|hard work
😩|weary face|tired
😫|tired face|exhausted
🥱|yawning face|bored sleepy
😤|face with steam from nose|triumph angry
😡|enraged face|angry mad
😠|angry face|mad
🤬|face with symbols on mouth|swearing cursing
😈|smiling face with horns|devil evil
👿|angry face with horns|devil imp
💀|skull|dead death
☠️|skull and crossbones|danger poison
💩|pile of poo|poop
🤡|clown face|clown
👹|ogre|monster
👺|goblin|monster
👻|ghost|halloween spooky
👽|alien|ufo extraterrestrial
👾|alien monster|game space invader
🤖|robot|bot machine
😺|grinning cat|cat smile
😸|grinning cat with smiling eyes|cat
😹|cat with tears of joy|cat laugh
😻|smiling cat with heart-eyes|cat love
😼|cat with wry smile|cat smirk
😽|kissing cat|cat kiss
🙀|weary cat|cat shock
😿|crying cat|cat sad
😾|pouting cat|cat angry
🙈|see-no-evil monkey|monkey hide
🙉|hear-no-evil monkey|monkey
🙊|speak-no-evil monkey|monkey secret
💌|love letter|love mail
💘|heart with arrow|love cupid
💝|heart with ribbon|love gift
💖|sparkling heart|love
💗|growing heart|love
💓|beating heart|love
💞|revolving hearts|love
💕|two hearts|love
💟|heart decoration|love
❣️|heart exclamation|love
💔|broken heart|sad breakup
❤️‍🔥|heart on fire|passion love
❤️‍🩹|mending heart|healing recovery
❤️|red heart|love
🩷|pink heart|love
🧡|orange heart|love
💛|yellow heart|love
💚|green heart|love
💙|blue heart|love
🩵|light blue heart|love
💜|purple heart|love
🤎|brown heart|love
🖤|black heart|love dark
🩶|grey heart|love gray
🤍|white heart|love
💋|kiss mark|kiss lips
💯|hundred points|perfect score 100
💢|anger symbol|angry
💥|collision|boom explosion
💫|dizzy|star
💦|sweat droplets|water splash
💨|dashing away|fast wind
🕳️|hole|pit
💬|speech balloon|chat comment message
👁️‍🗨️|eye in speech bubble|witness
🗨️|left speech bubble|chat
🗯️|right anger bubble|angry
💭|thought balloon|think
💤|zzz|sleep
`

const PEOPLE = `
👋|waving hand|hello bye wave
🤚|raised back of hand|hand
🖐️|hand with fingers splayed|hand five
✋|raised hand|stop high five
🖖|vulcan salute|spock
🫱|rightwards hand|hand
🫲|leftwards hand|hand
🫳|palm down hand|drop
🫴|palm up hand|offer
🫷|leftwards pushing hand|push stop
🫸|rightwards pushing hand|push stop
👌|OK hand|ok perfect
🤌|pinched fingers|italian
🤏|pinching hand|small little
✌️|victory hand|peace
🤞|crossed fingers|luck hope
🫰|hand with index finger and thumb crossed|love money
🤟|love-you gesture|ily
🤘|sign of the horns|rock metal
🤙|call me hand|call shaka
👈|backhand index pointing left|left point
👉|backhand index pointing right|right point
👆|backhand index pointing up|up point
🖕|middle finger|rude
👇|backhand index pointing down|down point
☝️|index pointing up|up
🫵|index pointing at the viewer|you point
👍|thumbs up|like yes approve +1
👎|thumbs down|dislike no -1
✊|raised fist|power
👊|oncoming fist|punch bump
🤛|left-facing fist|fist bump
🤜|right-facing fist|fist bump
👏|clapping hands|applause clap
🙌|raising hands|celebrate hooray
🫶|heart hands|love
👐|open hands|hug
🤲|palms up together|prayer
🤝|handshake|agreement deal
🙏|folded hands|please thanks pray
✍️|writing hand|write
💅|nail polish|manicure
🤳|selfie|camera phone
💪|flexed biceps|strong muscle
🦾|mechanical arm|prosthetic
🦿|mechanical leg|prosthetic
🦵|leg|kick
🦶|foot|kick stomp
👂|ear|hear listen
🦻|ear with hearing aid|accessibility
👃|nose|smell
🧠|brain|smart intelligent
🫀|anatomical heart|organ
🫁|lungs|breath
🦷|tooth|dentist
🦴|bone|skeleton
👀|eyes|look see
👁️|eye|look see
👅|tongue|taste
👄|mouth|lips
🫦|biting lip|nervous flirt
👶|baby|child newborn
🧒|child|kid
👦|boy|kid
👧|girl|kid
🧑|person|adult
👱|person blond hair|blond
👨|man|male
🧔|person beard|beard
👩|woman|female
🧓|older person|elderly old
👴|old man|elderly grandpa
👵|old woman|elderly grandma
🙍|person frowning|upset
🙎|person pouting|upset
🙅|person gesturing NO|no
🙆|person gesturing OK|ok
💁|person tipping hand|info sassy
🙋|person raising hand|question hello
🧏|deaf person|accessibility
🙇|person bowing|sorry respect
🤦|person facepalming|facepalm
🤷|person shrugging|shrug whatever
🧑‍⚕️|health worker|doctor nurse
🧑‍🎓|student|graduate school
🧑‍🏫|teacher|professor
🧑‍⚖️|judge|law justice
🧑‍🌾|farmer|agriculture
🧑‍🍳|cook|chef
🧑‍🔧|mechanic|repair
🧑‍🏭|factory worker|industrial
🧑‍💼|office worker|business
🧑‍🔬|scientist|lab research
🧑‍💻|technologist|developer programmer coder computer
🧑‍🎤|singer|music star
🧑‍🎨|artist|painter
🧑‍✈️|pilot|plane
🧑‍🚀|astronaut|space
🧑‍🚒|firefighter|fire
👮|police officer|cop
🕵️|detective|spy
💂|guard|soldier
🥷|ninja|stealth
👷|construction worker|builder
🫅|person with crown|royal monarch
🤴|prince|royal
👸|princess|royal
👳|person wearing turban|turban
👲|person with skullcap|cap
🧕|woman with headscarf|hijab
🤵|person in tuxedo|wedding
👰|person with veil|bride wedding
🤰|pregnant woman|pregnant
🫄|pregnant person|pregnant
🤱|breast-feeding|baby nursing
🧑‍🍼|person feeding baby|baby bottle
👼|baby angel|angel
🎅|Santa Claus|christmas
🤶|Mrs. Claus|christmas
🦸|superhero|hero power
🦹|supervillain|villain evil
🧙|mage|wizard witch magic
🧚|fairy|magic
🧛|vampire|dracula
🧜|merperson|mermaid
🧝|elf|fantasy
🧞|genie|wish
🧟|zombie|undead
🧌|troll|fantasy
💆|person getting massage|spa relax
💇|person getting haircut|barber
🚶|person walking|walk
🧍|person standing|stand
🧎|person kneeling|kneel
🧑‍🦯|person with white cane|blind accessibility
🧑‍🦼|person in motorized wheelchair|accessibility
🧑‍🦽|person in manual wheelchair|accessibility
🏃|person running|run jog
💃|woman dancing|dance
🕺|man dancing|dance
🕴️|person in suit levitating|business
👯|people with bunny ears|party
🧖|person in steamy room|sauna spa
🧗|person climbing|climb
🤺|person fencing|fencing sword
🏇|horse racing|jockey
⛷️|skier|ski snow
🏂|snowboarder|snow
🏌️|person golfing|golf
🏄|person surfing|surf
🚣|person rowing boat|row
🏊|person swimming|swim
⛹️|person bouncing ball|basketball
🏋️|person lifting weights|gym weightlifting
🚴|person biking|cycling bike
🚵|person mountain biking|cycling bike
🤸|person cartwheeling|gymnastics
🤼|people wrestling|wrestle
🤽|person playing water polo|polo
🤾|person playing handball|handball
🤹|person juggling|juggle multitask
🧘|person in lotus position|yoga meditation
🛀|person taking bath|bath
🛌|person in bed|sleep
🧑‍🤝‍🧑|people holding hands|friends
👭|women holding hands|friends
👫|woman and man holding hands|couple
👬|men holding hands|couple
💏|kiss|couple love
💑|couple with heart|love
👪|family|parents children
🗣️|speaking head|speak talk
👤|bust in silhouette|user person
👥|busts in silhouette|users group team
🫂|people hugging|hug
👣|footprints|steps
`

const NATURE = `
🐵|monkey face|monkey
🐒|monkey|animal
🦍|gorilla|ape
🦧|orangutan|ape
🐶|dog face|dog puppy pet
🐕|dog|pet
🦮|guide dog|accessibility
🐕‍🦺|service dog|assistance
🐩|poodle|dog
🐺|wolf|animal
🦊|fox|animal
🦝|raccoon|animal
🐱|cat face|cat kitten pet
🐈|cat|pet
🐈‍⬛|black cat|cat
🦁|lion|animal
🐯|tiger face|tiger
🐅|tiger|animal
🐆|leopard|animal
🐴|horse face|horse
🫎|moose|animal
🫏|donkey|animal
🐎|horse|animal
🦄|unicorn|magic
🦓|zebra|animal
🦌|deer|animal
🦬|bison|animal
🐮|cow face|cow
🐂|ox|animal
🐃|water buffalo|animal
🐄|cow|animal
🐷|pig face|pig
🐖|pig|animal
🐗|boar|animal
🐽|pig nose|pig
🐏|ram|sheep
🐑|ewe|sheep
🐐|goat|animal
🐪|camel|desert
🐫|two-hump camel|desert
🦙|llama|alpaca
🦒|giraffe|animal
🐘|elephant|animal
🦣|mammoth|extinct
🦏|rhinoceros|animal
🦛|hippopotamus|animal
🐭|mouse face|mouse
🐁|mouse|animal
🐀|rat|animal
🐹|hamster|pet
🐰|rabbit face|bunny
🐇|rabbit|bunny
🐿️|chipmunk|squirrel
🦫|beaver|animal
🦔|hedgehog|animal
🦇|bat|animal vampire
🐻|bear|animal
🐻‍❄️|polar bear|arctic
🐨|koala|animal
🐼|panda|animal
🦥|sloth|lazy slow
🦦|otter|animal
🦨|skunk|smell
🦘|kangaroo|australia
🦡|badger|animal
🐾|paw prints|paws pet
🦃|turkey|bird
🐔|chicken|bird
🐓|rooster|bird
🐣|hatching chick|baby bird
🐤|baby chick|bird
🐥|front-facing baby chick|bird
🐦|bird|animal
🐧|penguin|bird
🕊️|dove|peace bird
🦅|eagle|bird
🦆|duck|bird
🦢|swan|bird
🦉|owl|bird wise
🦤|dodo|extinct bird
🪶|feather|light
🦩|flamingo|bird
🦚|peacock|bird
🦜|parrot|bird
🪽|wing|fly angel
🐦‍⬛|black bird|crow
🪿|goose|bird
🐸|frog|animal
🐊|crocodile|reptile
🐢|turtle|slow
🦎|lizard|reptile
🐍|snake|reptile
🐲|dragon face|dragon
🐉|dragon|fantasy
🦕|sauropod|dinosaur
🦖|T-Rex|dinosaur
🐳|spouting whale|whale
🐋|whale|sea
🐬|dolphin|sea
🦭|seal|sea
🐟|fish|sea
🐠|tropical fish|sea
🐡|blowfish|fish
🦈|shark|sea
🐙|octopus|sea
🐚|spiral shell|beach
🪸|coral|reef
🪼|jellyfish|sea
🐌|snail|slow
🦋|butterfly|insect
🐛|bug|insect caterpillar
🐜|ant|insect
🐝|honeybee|bee insect
🪲|beetle|insect
🐞|lady beetle|ladybug insect
🦗|cricket|insect
🪳|cockroach|insect
🕷️|spider|insect
🕸️|spider web|web
🦂|scorpion|animal
🦟|mosquito|insect
🪰|fly|insect
🪱|worm|animal
🦠|microbe|virus bacteria germ
💐|bouquet|flowers
🌸|cherry blossom|flower spring
💮|white flower|flower
🪷|lotus|flower
🏵️|rosette|flower
🌹|rose|flower love
🥀|wilted flower|sad
🌺|hibiscus|flower
🌻|sunflower|flower
🌼|blossom|flower
🌷|tulip|flower
🪻|hyacinth|flower
🌱|seedling|plant grow
🪴|potted plant|plant
🌲|evergreen tree|tree
🌳|deciduous tree|tree
🌴|palm tree|tropical
🌵|cactus|desert
🌾|sheaf of rice|grain
🌿|herb|plant
☘️|shamrock|clover irish
🍀|four leaf clover|luck
🍁|maple leaf|autumn canada
🍂|fallen leaf|autumn
🍃|leaf fluttering in wind|wind
🪹|empty nest|bird
🪺|nest with eggs|bird
🍄|mushroom|fungus
🌍|globe showing Europe-Africa|earth world
🌎|globe showing Americas|earth world
🌏|globe showing Asia-Australia|earth world
🌑|new moon|moon
🌓|first quarter moon|moon
🌕|full moon|moon
🌗|last quarter moon|moon
🌙|crescent moon|moon night
🌚|new moon face|moon
🌝|full moon face|moon
☀️|sun|sunny weather
🌞|sun with face|sunny
⭐|star|favorite
🌟|glowing star|sparkle
🌠|shooting star|wish
🌌|milky way|galaxy space
☁️|cloud|weather
⛅|sun behind cloud|weather
⛈️|cloud with lightning and rain|storm
🌤️|sun behind small cloud|weather
🌧️|cloud with rain|weather
🌨️|cloud with snow|weather
🌩️|cloud with lightning|storm
🌪️|tornado|weather
🌫️|fog|weather
🌬️|wind face|weather
🌀|cyclone|hurricane
🌈|rainbow|weather pride
☂️|umbrella|rain
☔|umbrella with rain drops|rain
⚡|high voltage|lightning electric
❄️|snowflake|snow cold winter
☃️|snowman|winter
⛄|snowman without snow|winter
☄️|comet|space
🔥|fire|hot flame lit
💧|droplet|water
🌊|water wave|ocean sea
`

const FOOD = `
🍇|grapes|fruit
🍈|melon|fruit
🍉|watermelon|fruit
🍊|tangerine|orange fruit
🍋|lemon|fruit
🍌|banana|fruit
🍍|pineapple|fruit
🥭|mango|fruit
🍎|red apple|fruit
🍏|green apple|fruit
🍐|pear|fruit
🍑|peach|fruit
🍒|cherries|fruit
🍓|strawberry|fruit
🫐|blueberries|fruit
🥝|kiwi fruit|fruit
🍅|tomato|vegetable
🫒|olive|food
🥥|coconut|fruit
🥑|avocado|fruit
🍆|eggplant|aubergine vegetable
🥔|potato|vegetable
🥕|carrot|vegetable
🌽|ear of corn|maize vegetable
🌶️|hot pepper|spicy chili
🫑|bell pepper|vegetable
🥒|cucumber|vegetable
🥬|leafy green|lettuce vegetable
🥦|broccoli|vegetable
🧄|garlic|vegetable
🧅|onion|vegetable
🥜|peanuts|nut
🫘|beans|food
🌰|chestnut|nut
🫚|ginger root|spice
🫛|pea pod|vegetable
🍞|bread|loaf
🥐|croissant|bread breakfast
🥖|baguette bread|bread french
🫓|flatbread|bread
🥨|pretzel|snack
🥯|bagel|bread breakfast
🥞|pancakes|breakfast
🧇|waffle|breakfast
🧀|cheese wedge|cheese
🍖|meat on bone|meat
🍗|poultry leg|chicken meat
🥩|cut of meat|steak
🥓|bacon|breakfast meat
🍔|hamburger|burger
🍟|french fries|fries chips
🍕|pizza|food
🌭|hot dog|sausage
🥪|sandwich|food
🌮|taco|mexican
🌯|burrito|mexican
🫔|tamale|mexican
🥙|stuffed flatbread|kebab gyro
🧆|falafel|food
🥚|egg|breakfast
🍳|cooking|fried egg pan
🥘|shallow pan of food|paella
🍲|pot of food|stew
🫕|fondue|cheese
🥣|bowl with spoon|soup cereal
🥗|green salad|salad
🍿|popcorn|movie snack
🧈|butter|dairy
🧂|salt|seasoning
🥫|canned food|can
🍱|bento box|lunch
🍘|rice cracker|snack
🍙|rice ball|onigiri
🍚|cooked rice|rice
🍛|curry rice|curry
🍜|steaming bowl|noodles ramen
🍝|spaghetti|pasta
🍠|roasted sweet potato|potato
🍢|oden|skewer
🍣|sushi|japanese
🍤|fried shrimp|tempura
🍥|fish cake with swirl|narutomaki
🥮|moon cake|festival
🍡|dango|sweet
🥟|dumpling|gyoza
🥠|fortune cookie|prophecy
🥡|takeout box|chinese food
🦀|crab|seafood
🦞|lobster|seafood
🦐|shrimp|seafood
🦑|squid|seafood
🦪|oyster|seafood
🍦|soft ice cream|dessert
🍧|shaved ice|dessert
🍨|ice cream|dessert
🍩|doughnut|donut dessert
🍪|cookie|biscuit dessert
🎂|birthday cake|celebration dessert
🍰|shortcake|cake dessert
🧁|cupcake|dessert
🥧|pie|dessert
🍫|chocolate bar|sweet
🍬|candy|sweet
🍭|lollipop|sweet candy
🍮|custard|pudding dessert
🍯|honey pot|sweet
🍼|baby bottle|milk
🥛|glass of milk|drink
☕|hot beverage|coffee tea drink
🫖|teapot|tea
🍵|teacup without handle|tea green drink
🍶|sake|drink
🍾|bottle with popping cork|champagne celebrate
🍷|wine glass|wine drink
🍸|cocktail glass|drink martini
🍹|tropical drink|cocktail
🍺|beer mug|beer drink
🍻|clinking beer mugs|cheers beer
🥂|clinking glasses|cheers toast
🥃|tumbler glass|whisky drink
🫗|pouring liquid|spill
🥤|cup with straw|soda drink
🧋|bubble tea|boba drink
🧃|beverage box|juice drink
🧉|mate|drink
🧊|ice|cold cube
🥢|chopsticks|utensil
🍽️|fork and knife with plate|dinner
🍴|fork and knife|cutlery
🥄|spoon|cutlery
🔪|kitchen knife|knife cooking
🫙|jar|container
🏺|amphora|vase
`

const TRAVEL = `
🗺️|world map|travel
🗾|map of Japan|map
🧭|compass|navigation
🏔️|snow-capped mountain|cold
⛰️|mountain|nature
🌋|volcano|eruption
🗻|mount fuji|mountain
🏕️|camping|tent
🏖️|beach with umbrella|holiday vacation
🏜️|desert|sand
🏝️|desert island|holiday
🏞️|national park|park
🏟️|stadium|arena
🏛️|classical building|museum
🏗️|building construction|crane
🧱|brick|wall
🪨|rock|stone
🪵|wood|log timber
🛖|hut|house
🏘️|houses|neighbourhood
🏚️|derelict house|abandoned
🏠|house|home
🏡|house with garden|home
🏢|office building|work
🏣|Japanese post office|post
🏤|post office|mail
🏥|hospital|doctor
🏦|bank|money
🏨|hotel|travel
🏩|love hotel|hotel
🏪|convenience store|shop
🏫|school|education
🏬|department store|shop
🏭|factory|industry
🏯|Japanese castle|castle
🏰|castle|palace
💒|wedding|chapel
🗼|Tokyo tower|tower
🗽|Statue of Liberty|new york
⛪|church|religion
🕌|mosque|religion
🛕|hindu temple|religion
🕍|synagogue|religion
⛩️|shinto shrine|religion
🕋|kaaba|religion
⛲|fountain|water
⛺|tent|camping
🌁|foggy|city
🌃|night with stars|city
🏙️|cityscape|city
🌄|sunrise over mountains|morning
🌅|sunrise|morning
🌆|cityscape at dusk|evening
🌇|sunset|evening
🌉|bridge at night|city
♨️|hot springs|spa
🎠|carousel horse|fair
🛝|playground slide|play
🎡|ferris wheel|fair
🎢|roller coaster|amusement park
💈|barber pole|haircut
🎪|circus tent|circus
🚂|locomotive|train
🚃|railway car|train
🚄|high-speed train|train
🚅|bullet train|train
🚆|train|rail
🚇|metro|subway
🚈|light rail|train
🚉|station|train
🚊|tram|transport
🚝|monorail|train
🚞|mountain railway|train
🚋|tram car|transport
🚌|bus|transport
🚍|oncoming bus|transport
🚎|trolleybus|transport
🚐|minibus|van
🚑|ambulance|emergency
🚒|fire engine|emergency
🚓|police car|emergency
🚔|oncoming police car|emergency
🚕|taxi|cab
🚖|oncoming taxi|cab
🚗|automobile|car
🚘|oncoming automobile|car
🚙|sport utility vehicle|suv car
🛻|pickup truck|car
🚚|delivery truck|shipping
🚛|articulated lorry|truck
🚜|tractor|farm
🏎️|racing car|race
🏍️|motorcycle|bike
🛵|motor scooter|scooter
🦽|manual wheelchair|accessibility
🦼|motorized wheelchair|accessibility
🛺|auto rickshaw|tuk tuk
🚲|bicycle|bike
🛴|kick scooter|scooter
🛹|skateboard|skate
🛼|roller skate|skate
🚏|bus stop|bus
🛣️|motorway|highway road
🛤️|railway track|train
🛢️|oil drum|oil
⛽|fuel pump|gas petrol
🛞|wheel|tire
🚨|police car light|siren alert
🚥|horizontal traffic light|traffic
🚦|vertical traffic light|traffic
🛑|stop sign|stop
🚧|construction|barrier work
⚓|anchor|ship
🛟|ring buoy|lifebuoy rescue
⛵|sailboat|boat
🛶|canoe|boat
🚤|speedboat|boat
🛳️|passenger ship|cruise
⛴️|ferry|boat
🛥️|motor boat|boat
🚢|ship|boat
✈️|airplane|plane flight
🛩️|small airplane|plane
🛫|airplane departure|flight takeoff
🛬|airplane arrival|flight landing
🪂|parachute|skydive
💺|seat|chair
🚁|helicopter|flight
🚟|suspension railway|train
🚠|mountain cableway|cable car
🚡|aerial tramway|cable car
🛰️|satellite|space
🚀|rocket|launch space
🛸|flying saucer|ufo
🛎️|bellhop bell|hotel
🧳|luggage|suitcase travel
⌛|hourglass done|time
⏳|hourglass not done|time waiting
⌚|watch|time
⏰|alarm clock|time wake
⏱️|stopwatch|time
⏲️|timer clock|time
🕰️|mantelpiece clock|time
🕛|twelve o’clock|time
🕐|one o’clock|time
🌡️|thermometer|temperature
🪐|ringed planet|saturn space
`

const ACTIVITIES = `
🎃|jack-o-lantern|halloween pumpkin
🎄|Christmas tree|christmas
🎆|fireworks|celebration
🎇|sparkler|fireworks
🧨|firecracker|explosive
✨|sparkles|shiny magic
🎈|balloon|party
🎉|party popper|celebration tada
🎊|confetti ball|celebration
🎋|tanabata tree|festival
🎍|pine decoration|festival
🎎|Japanese dolls|festival
🎏|carp streamer|festival
🎐|wind chime|summer
🎑|moon viewing ceremony|festival
🧧|red envelope|gift money
🎀|ribbon|bow
🎁|wrapped gift|present birthday
🎗️|reminder ribbon|awareness
🎟️|admission tickets|ticket
🎫|ticket|admission
🎖️|military medal|award
🏆|trophy|win award
🏅|sports medal|award
🥇|1st place medal|gold first
🥈|2nd place medal|silver second
🥉|3rd place medal|bronze third
⚽|soccer ball|football sport
⚾|baseball|sport
🥎|softball|sport
🏀|basketball|sport
🏐|volleyball|sport
🏈|american football|sport
🏉|rugby football|sport
🎾|tennis|sport
🥏|flying disc|frisbee
🎳|bowling|sport
🏏|cricket game|sport
🏑|field hockey|sport
🏒|ice hockey|sport
🥍|lacrosse|sport
🏓|ping pong|table tennis
🏸|badminton|sport
🥊|boxing glove|sport
🥋|martial arts uniform|judo karate
🥅|goal net|sport
⛳|flag in hole|golf
⛸️|ice skate|skating
🎣|fishing pole|fish
🤿|diving mask|snorkel
🎽|running shirt|sport
🎿|skis|ski
🛷|sled|winter
🥌|curling stone|sport
🎯|bullseye|target dart
🪀|yo-yo|toy
🪁|kite|toy
🔫|water pistol|toy gun
🎱|pool 8 ball|billiards
🔮|crystal ball|fortune magic
🪄|magic wand|magic
🎮|video game|controller gaming
🕹️|joystick|game
🎰|slot machine|casino
🎲|game die|dice
🧩|puzzle piece|jigsaw
🧸|teddy bear|toy
🪅|piñata|party
🪩|mirror ball|disco
🪆|nesting dolls|russian
♠️|spade suit|cards
♥️|heart suit|cards
♦️|diamond suit|cards
♣️|club suit|cards
♟️|chess pawn|chess
🃏|joker|cards
🀄|mahjong red dragon|game
🎴|flower playing cards|game
🎭|performing arts|theater
🖼️|framed picture|art painting
🎨|artist palette|art paint
🧵|thread|sewing
🪡|sewing needle|sewing
🧶|yarn|knitting
🪢|knot|rope
`

const OBJECTS = `
👓|glasses|eyeglasses
🕶️|sunglasses|cool
🥽|goggles|protection
🥼|lab coat|science
🦺|safety vest|protection
👔|necktie|clothing
👕|t-shirt|clothing shirt
👖|jeans|clothing pants
🧣|scarf|clothing
🧤|gloves|clothing
🧥|coat|clothing jacket
🧦|socks|clothing
👗|dress|clothing
👘|kimono|clothing
🥻|sari|clothing
🩱|one-piece swimsuit|clothing
🩲|briefs|clothing swimsuit
🩳|shorts|clothing
👙|bikini|clothing swimsuit
👚|woman’s clothes|clothing
🪭|folding hand fan|fan
👛|purse|bag
👜|handbag|bag
👝|clutch bag|bag
🛍️|shopping bags|shopping
🎒|backpack|bag school
🩴|thong sandal|shoe flip flop
👞|man’s shoe|shoe
👟|running shoe|shoe sneaker
🥾|hiking boot|shoe
🥿|flat shoe|shoe
👠|high-heeled shoe|shoe
👡|woman’s sandal|shoe
🩰|ballet shoes|shoe dance
👢|woman’s boot|shoe
👑|crown|king queen royal
👒|woman’s hat|hat
🎩|top hat|hat
🎓|graduation cap|school education
🧢|billed cap|hat
🪖|military helmet|army
⛑️|rescue worker’s helmet|aid
📿|prayer beads|religion
💄|lipstick|makeup
💍|ring|wedding engagement
💎|gem stone|diamond jewel
🔇|muted speaker|mute silent
🔈|speaker low volume|sound
🔉|speaker medium volume|sound
🔊|speaker high volume|sound loud
📢|loudspeaker|announcement
📣|megaphone|announcement
📯|postal horn|horn
🔔|bell|notification
🔕|bell with slash|mute silent
🎼|musical score|music
🎵|musical note|music
🎶|musical notes|music
🎙️|studio microphone|podcast
🎚️|level slider|audio
🎛️|control knobs|audio
🎤|microphone|karaoke sing
🎧|headphone|music audio
📻|radio|music
🎷|saxophone|music instrument
🪗|accordion|music instrument
🎸|guitar|music instrument
🎹|musical keyboard|piano instrument
🎺|trumpet|music instrument
🎻|violin|music instrument
🪕|banjo|music instrument
🥁|drum|music instrument
🪘|long drum|music instrument
🪇|maracas|music instrument
🪈|flute|music instrument
📱|mobile phone|smartphone cell
📲|mobile phone with arrow|call
☎️|telephone|phone
📞|telephone receiver|phone call
📟|pager|beeper
📠|fax machine|fax
🔋|battery|power
🪫|low battery|power empty
🔌|electric plug|power
💻|laptop|computer
🖥️|desktop computer|computer screen
🖨️|printer|print
⌨️|keyboard|typing
🖱️|computer mouse|click
🖲️|trackball|computer
💽|computer disk|minidisc
💾|floppy disk|save
💿|optical disk|cd
📀|dvd|disk
🧮|abacus|calculation
🎥|movie camera|film
🎞️|film frames|movie
📽️|film projector|movie
🎬|clapper board|movie action
📺|television|tv
📷|camera|photo
📸|camera with flash|photo
📹|video camera|video
📼|videocassette|vhs
🔍|magnifying glass tilted left|search find zoom
🔎|magnifying glass tilted right|search find zoom
🕯️|candle|light
💡|light bulb|idea
🔦|flashlight|torch
🏮|red paper lantern|lantern
🪔|diya lamp|oil lamp
📔|notebook with decorative cover|notes
📕|closed book|read
📖|open book|read
📗|green book|read
📘|blue book|read
📙|orange book|read
📚|books|library read
📓|notebook|notes
📒|ledger|notes
📃|page with curl|document
📜|scroll|document
📄|page facing up|document
📰|newspaper|news
🗞️|rolled-up newspaper|news
📑|bookmark tabs|marker
🔖|bookmark|marker
🏷️|label|tag
💰|money bag|dollar
🪙|coin|money
💴|yen banknote|money
💵|dollar banknote|money
💶|euro banknote|money
💷|pound banknote|money
💸|money with wings|spend
💳|credit card|payment
🧾|receipt|invoice
💹|chart increasing with yen|market
✉️|envelope|mail letter
📧|e-mail|email mail
📨|incoming envelope|mail
📩|envelope with arrow|mail send
📤|outbox tray|mail send
📥|inbox tray|mail receive
📦|package|box parcel
📫|closed mailbox with raised flag|mail
📪|closed mailbox with lowered flag|mail
📬|open mailbox with raised flag|mail
📭|open mailbox with lowered flag|mail
📮|postbox|mail
🗳️|ballot box with ballot|vote
✏️|pencil|write
✒️|black nib|pen
🖋️|fountain pen|pen
🖊️|pen|write
🖌️|paintbrush|paint
🖍️|crayon|draw
📝|memo|note write
💼|briefcase|work business
📁|file folder|folder
📂|open file folder|folder
🗂️|card index dividers|organize
📅|calendar|date
📆|tear-off calendar|date
🗒️|spiral notepad|note
🗓️|spiral calendar|date
📇|card index|rolodex
📈|chart increasing|graph growth
📉|chart decreasing|graph decline
📊|bar chart|graph statistics
📋|clipboard|copy
📌|pushpin|pin
📍|round pushpin|pin location
📎|paperclip|attach
🖇️|linked paperclips|attach
📏|straight ruler|measure
📐|triangular ruler|measure
✂️|scissors|cut
🗃️|card file box|box
🗄️|file cabinet|filing
🗑️|wastebasket|trash delete bin
🔒|locked|lock secure
🔓|unlocked|lock open
🔏|locked with pen|lock privacy
🔐|locked with key|lock secure
🔑|key|password lock
🗝️|old key|lock
🔨|hammer|tool
🪓|axe|tool
⛏️|pick|tool mining
⚒️|hammer and pick|tool
🛠️|hammer and wrench|tools
🗡️|dagger|knife weapon
⚔️|crossed swords|weapon
💣|bomb|explosive
🪃|boomerang|return
🏹|bow and arrow|archery
🛡️|shield|protection
🪚|carpentry saw|tool
🔧|wrench|tool
🪛|screwdriver|tool
🔩|nut and bolt|tool
⚙️|gear|settings cog
🗜️|clamp|tool
⚖️|balance scale|justice law
🦯|white cane|blind accessibility
🔗|link|chain url
⛓️|chains|chain
🪝|hook|catch
🧰|toolbox|tools
🧲|magnet|attraction
🪜|ladder|climb
⚗️|alembic|chemistry
🧪|test tube|science chemistry
🧫|petri dish|biology
🧬|dna|biology gene
🔬|microscope|science
🔭|telescope|astronomy
📡|satellite antenna|signal
💉|syringe|vaccine injection
🩸|drop of blood|blood donation
💊|pill|medicine
🩹|adhesive bandage|plaster
🩼|crutch|injury
🩺|stethoscope|doctor
🩻|x-ray|skeleton medical
🚪|door|entrance
🛗|elevator|lift
🪞|mirror|reflection
🪟|window|glass
🛏️|bed|sleep hotel
🛋️|couch and lamp|sofa
🪑|chair|seat
🚽|toilet|bathroom
🪠|plunger|toilet
🚿|shower|bathroom
🛁|bathtub|bath
🪤|mouse trap|trap
🪒|razor|shave
🧴|lotion bottle|sunscreen
🧷|safety pin|diaper
🧹|broom|cleaning
🧺|basket|laundry
🧻|roll of paper|toilet paper
🪣|bucket|pail
🧼|soap|cleaning
🫧|bubbles|soap
🪥|toothbrush|dental
🧽|sponge|cleaning
🧯|fire extinguisher|fire safety
🛒|shopping cart|shop trolley
🚬|cigarette|smoking
⚰️|coffin|death
🪦|headstone|grave
⚱️|funeral urn|death
🧿|nazar amulet|evil eye
🪬|hamsa|protection
🗿|moai|statue
🪧|placard|sign protest
🪪|identification card|id
`

const SYMBOLS = `
🏧|ATM sign|cash bank
🚮|litter in bin sign|trash
🚰|potable water|drink
♿|wheelchair symbol|accessibility
🚹|men’s room|restroom toilet
🚺|women’s room|restroom toilet
🚻|restroom|toilet wc
🚼|baby symbol|changing
🚾|water closet|toilet wc
🛂|passport control|border
🛃|customs|border
🛄|baggage claim|airport
🛅|left luggage|airport
⚠️|warning|caution alert
🚸|children crossing|school
⛔|no entry|forbidden
🚫|prohibited|forbidden no
🚳|no bicycles|forbidden
🚭|no smoking|forbidden
🚯|no littering|forbidden
🚱|non-potable water|forbidden
🚷|no pedestrians|forbidden
📵|no mobile phones|forbidden
🔞|no one under eighteen|adult 18
☢️|radioactive|nuclear danger
☣️|biohazard|danger
⬆️|up arrow|direction north
↗️|up-right arrow|direction
➡️|right arrow|direction east next
↘️|down-right arrow|direction
⬇️|down arrow|direction south
↙️|down-left arrow|direction
⬅️|left arrow|direction west back
↖️|up-left arrow|direction
↕️|up-down arrow|direction
↔️|left-right arrow|direction
↩️|right arrow curving left|return undo
↪️|left arrow curving right|forward redo
⤴️|right arrow curving up|direction
⤵️|right arrow curving down|direction
🔃|clockwise vertical arrows|refresh reload
🔄|counterclockwise arrows button|refresh sync
🔙|BACK arrow|back
🔚|END arrow|end
🔛|ON! arrow|on
🔜|SOON arrow|soon
🔝|TOP arrow|top
🛐|place of worship|religion
⚛️|atom symbol|science
🕉️|om|religion
✡️|star of David|religion jewish
☸️|wheel of dharma|religion buddhist
☯️|yin yang|balance
✝️|latin cross|religion christian
☦️|orthodox cross|religion christian
☪️|star and crescent|religion islam
☮️|peace symbol|peace
🕎|menorah|religion jewish
🔯|dotted six-pointed star|fortune
🪯|khanda|religion sikh
♈|Aries|zodiac
♉|Taurus|zodiac
♊|Gemini|zodiac
♋|Cancer|zodiac
♌|Leo|zodiac
♍|Virgo|zodiac
♎|Libra|zodiac
♏|Scorpio|zodiac
♐|Sagittarius|zodiac
♑|Capricorn|zodiac
♒|Aquarius|zodiac
♓|Pisces|zodiac
⛎|Ophiuchus|zodiac
🔀|shuffle tracks button|random
🔁|repeat button|loop
🔂|repeat single button|loop
▶️|play button|start
⏩|fast-forward button|forward
⏭️|next track button|skip
⏯️|play or pause button|toggle
◀️|reverse button|back
⏪|fast reverse button|rewind
⏮️|last track button|previous
🔼|upwards button|up
⏫|fast up button|up
🔽|downwards button|down
⏬|fast down button|down
⏸️|pause button|pause
⏹️|stop button|stop
⏺️|record button|record
⏏️|eject button|eject
🎦|cinema|movie
🔅|dim button|brightness
🔆|bright button|brightness
📶|antenna bars|signal
🛜|wireless|wifi
📳|vibration mode|phone
📴|mobile phone off|phone
♀️|female sign|woman gender
♂️|male sign|man gender
⚧️|transgender symbol|gender
✖️|multiply|math times
➕|plus|math add
➖|minus|math subtract
➗|divide|math division
🟰|heavy equals sign|math equal
♾️|infinity|forever
‼️|double exclamation mark|punctuation
⁉️|exclamation question mark|punctuation
❓|red question mark|question punctuation
❔|white question mark|question punctuation
❕|white exclamation mark|punctuation
❗|red exclamation mark|important punctuation
〰️|wavy dash|punctuation
💱|currency exchange|money
💲|heavy dollar sign|money
⚕️|medical symbol|health
♻️|recycling symbol|recycle
⚜️|fleur-de-lis|decoration
🔱|trident emblem|anchor
📛|name badge|badge
🔰|Japanese symbol for beginner|beginner
⭕|hollow red circle|circle
✅|check mark button|done yes ok
☑️|check box with check|done yes
✔️|check mark|done yes
❌|cross mark|no cancel delete
❎|cross mark button|no cancel
➰|curly loop|loop
➿|double curly loop|loop
〽️|part alternation mark|mark
✳️|eight-spoked asterisk|asterisk
✴️|eight-pointed star|star
❇️|sparkle|star
©️|copyright|c
®️|registered|r
™️|trade mark|tm
#️⃣|keycap #|hash number
*️⃣|keycap *|asterisk
0️⃣|keycap 0|number zero
1️⃣|keycap 1|number one
2️⃣|keycap 2|number two
3️⃣|keycap 3|number three
4️⃣|keycap 4|number four
5️⃣|keycap 5|number five
6️⃣|keycap 6|number six
7️⃣|keycap 7|number seven
8️⃣|keycap 8|number eight
9️⃣|keycap 9|number nine
🔟|keycap 10|number ten
🔠|input latin uppercase|letters abc
🔡|input latin lowercase|letters abc
🔢|input numbers|numbers 1234
🔣|input symbols|symbols
🔤|input latin letters|letters abc
🅰️|A button (blood type)|letter a
🆎|AB button (blood type)|letters ab
🅱️|B button (blood type)|letter b
🆑|CL button|clear
🆒|COOL button|cool
🆓|FREE button|free
ℹ️|information|info
🆔|ID button|identity
Ⓜ️|circled M|m
🆕|NEW button|new
🆖|NG button|ng
🅾️|O button (blood type)|letter o
🆗|OK button|ok
🅿️|P button|parking
🆘|SOS button|help emergency
🆙|UP! button|up
🆚|VS button|versus
🔴|red circle|red
🟠|orange circle|orange
🟡|yellow circle|yellow
🟢|green circle|green
🔵|blue circle|blue
🟣|purple circle|purple
🟤|brown circle|brown
⚫|black circle|black
⚪|white circle|white
🟥|red square|red
🟧|orange square|orange
🟨|yellow square|yellow
🟩|green square|green
🟦|blue square|blue
🟪|purple square|purple
🟫|brown square|brown
⬛|black large square|black
⬜|white large square|white
🔶|large orange diamond|orange
🔷|large blue diamond|blue
🔸|small orange diamond|orange
🔹|small blue diamond|blue
🔺|red triangle pointed up|up
🔻|red triangle pointed down|down
💠|diamond with a dot|cute
🔘|radio button|option
🔳|white square button|button
🔲|black square button|button
`

const FLAGS = `
🏁|chequered flag|race finish
🚩|triangular flag|red flag
🎌|crossed flags|japan
🏴|black flag|waving
🏳️|white flag|surrender
🏳️‍🌈|rainbow flag|pride lgbt
🏴‍☠️|pirate flag|jolly roger
`

// Rows are `ISO region code|region name`; the flag character is built from the two regional indicator letters.
const REGION_FLAGS = `
AC|Ascension Island
AD|Andorra
AE|United Arab Emirates
AF|Afghanistan
AG|Antigua & Barbuda
AI|Anguilla
AL|Albania
AM|Armenia
AO|Angola
AQ|Antarctica
AR|Argentina
AS|American Samoa
AT|Austria
AU|Australia
AW|Aruba
AX|Åland Islands
AZ|Azerbaijan
BA|Bosnia & Herzegovina
BB|Barbados
BD|Bangladesh
BE|Belgium
BF|Burkina Faso
BG|Bulgaria
BH|Bahrain
BI|Burundi
BJ|Benin
BL|St. Barthélemy
BM|Bermuda
BN|Brunei
BO|Bolivia
BQ|Caribbean Netherlands
BR|Brazil
BS|Bahamas
BT|Bhutan
BV|Bouvet Island
BW|Botswana
BY|Belarus
BZ|Belize
CA|Canada
CC|Cocos (Keeling) Islands
CD|Congo - Kinshasa
CF|Central African Republic
CG|Congo - Brazzaville
CH|Switzerland
CI|Côte d’Ivoire
CK|Cook Islands
CL|Chile
CM|Cameroon
CN|China
CO|Colombia
CP|Clipperton Island
CR|Costa Rica
CU|Cuba
CV|Cape Verde
CW|Curaçao
CX|Christmas Island
CY|Cyprus
CZ|Czechia
DE|Germany
DG|Diego Garcia
DJ|Djibouti
DK|Denmark
DM|Dominica
DO|Dominican Republic
DZ|Algeria
EA|Ceuta & Melilla
EC|Ecuador
EE|Estonia
EG|Egypt
EH|Western Sahara
ER|Eritrea
ES|Spain
ET|Ethiopia
EU|European Union
FI|Finland
FJ|Fiji
FK|Falkland Islands
FM|Micronesia
FO|Faroe Islands
FR|France
GA|Gabon
GB|United Kingdom
GD|Grenada
GE|Georgia
GF|French Guiana
GG|Guernsey
GH|Ghana
GI|Gibraltar
GL|Greenland
GM|Gambia
GN|Guinea
GP|Guadeloupe
GQ|Equatorial Guinea
GR|Greece
GS|South Georgia & South Sandwich Islands
GT|Guatemala
GU|Guam
GW|Guinea-Bissau
GY|Guyana
HK|Hong Kong SAR China
HM|Heard & McDonald Islands
HN|Honduras
HR|Croatia
HT|Haiti
HU|Hungary
IC|Canary Islands
ID|Indonesia
IE|Ireland
IL|Israel
IM|Isle of Man
IN|India
IO|British Indian Ocean Territory
IQ|Iraq
IR|Iran
IS|Iceland
IT|Italy
JE|Jersey
JM|Jamaica
JO|Jordan
JP|Japan
KE|Kenya
KG|Kyrgyzstan
KH|Cambodia
KI|Kiribati
KM|Comoros
KN|St. Kitts & Nevis
KP|North Korea
KR|South Korea
KW|Kuwait
KY|Cayman Islands
KZ|Kazakhstan
LA|Laos
LB|Lebanon
LC|St. Lucia
LI|Liechtenstein
LK|Sri Lanka
LR|Liberia
LS|Lesotho
LT|Lithuania
LU|Luxembourg
LV|Latvia
LY|Libya
MA|Morocco
MC|Monaco
MD|Moldova
ME|Montenegro
MF|St. Martin
MG|Madagascar
MH|Marshall Islands
MK|North Macedonia
ML|Mali
MM|Myanmar (Burma)
MN|Mongolia
MO|Macao SAR China
MP|Northern Mariana Islands
MQ|Martinique
MR|Mauritania
MS|Montserrat
MT|Malta
MU|Mauritius
MV|Maldives
MW|Malawi
MX|Mexico
MY|Malaysia
MZ|Mozambique
NA|Namibia
NC|New Caledonia
NE|Niger
NF|Norfolk Island
NG|Nigeria
NI|Nicaragua
NL|Netherlands
NO|Norway
NP|Nepal
NR|Nauru
NU|Niue
NZ|New Zealand
OM|Oman
PA|Panama
PE|Peru
PF|French Polynesia
PG|Papua New Guinea
PH|Philippines
PK|Pakistan
PL|Poland
PM|St. Pierre & Miquelon
PN|Pitcairn Islands
PR|Puerto Rico
PS|Palestinian Territories
PT|Portugal
PW|Palau
PY|Paraguay
QA|Qatar
RE|Réunion
RO|Romania
RS|Serbia
RU|Russia
RW|Rwanda
SA|Saudi Arabia
SB|Solomon Islands
SC|Seychelles
SD|Sudan
SE|Sweden
SG|Singapore
SH|St. Helena
SI|Slovenia
SJ|Svalbard & Jan Mayen
SK|Slovakia
SL|Sierra Leone
SM|San Marino
SN|Senegal
SO|Somalia
SR|Suriname
SS|South Sudan
ST|São Tomé & Príncipe
SV|El Salvador
SX|Sint Maarten
SY|Syria
SZ|Eswatini
TA|Tristan da Cunha
TC|Turks & Caicos Islands
TD|Chad
TF|French Southern Territories
TG|Togo
TH|Thailand
TJ|Tajikistan
TK|Tokelau
TL|Timor-Leste
TM|Turkmenistan
TN|Tunisia
TO|Tonga
TR|Türkiye
TT|Trinidad & Tobago
TV|Tuvalu
TW|Taiwan
TZ|Tanzania
UA|Ukraine
UG|Uganda
UM|U.S. Outlying Islands
UN|United Nations
US|United States
UY|Uruguay
UZ|Uzbekistan
VA|Vatican City
VC|St. Vincent & Grenadines
VE|Venezuela
VG|British Virgin Islands
VI|U.S. Virgin Islands
VN|Vietnam
VU|Vanuatu
WF|Wallis & Futuna
WS|Samoa
XK|Kosovo
YE|Yemen
YT|Mayotte
ZA|South Africa
ZM|Zambia
ZW|Zimbabwe
`

const REGIONAL_INDICATOR_A = 0x1F1E6

function rows(text: string) {
    return text.trim().split('\n').map((row) => row.trim().split('|'))
}

function parseEmojiRows(group: EmojiGroupId, text: string): Emoji[] {
    return rows(text).map(([char = '', name = '', keywords = '']) => ({ char, group, keywords: keywords.split(' '), name }))
}

function parseRegionFlagRows(text: string): Emoji[] {
    return rows(text).map(([code = '', name = '']) => ({
        char: String.fromCodePoint(...Array.from(code, (letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - 'A'.charCodeAt(0))),
        group: 'flags',
        keywords: ['flag', code.toLowerCase()],
        name: `flag ${name}`,
    }))
}

/** Committed emoji catalogue for the Markdown editor picker; no runtime dependency or network fetch. */
export const EMOJIS: readonly Emoji[] = Object.freeze([
    ...parseEmojiRows('smileys', SMILEYS),
    ...parseEmojiRows('people', PEOPLE),
    ...parseEmojiRows('nature', NATURE),
    ...parseEmojiRows('food', FOOD),
    ...parseEmojiRows('travel', TRAVEL),
    ...parseEmojiRows('activities', ACTIVITIES),
    ...parseEmojiRows('objects', OBJECTS),
    ...parseEmojiRows('symbols', SYMBOLS),
    ...parseEmojiRows('flags', FLAGS),
    ...parseRegionFlagRows(REGION_FLAGS),
].map((emoji) => Object.freeze({ ...emoji, keywords: Object.freeze(emoji.keywords) })))
