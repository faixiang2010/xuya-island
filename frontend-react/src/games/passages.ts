/** 六年级课文练习库：语文按部编版六三制，英语按人教版 PEP。 */
export interface Passage {
  id: string
  title: string
  language: 'zh' | 'en'
  grade: '六年级上' | '六年级下'
  unit: string
  source: string
  goal: string
  /** 长篇课文（约 200–500 字）排在前面；古诗与文言文保留为短篇。 */
  long?: boolean
  segments: string[]
}

export const passages: Passage[] = [
  {
    id: 'cao-yuan',
    title: '草原（长片段）',
    language: 'zh',
    grade: '六年级上',
    unit: '第一单元 · 草原',
    source: '老舍《草原》（公版课文片段）',
    goal: '长篇课文约 300 字，练习逗号、句号和分号的连续输入。',
    long: true,
    segments: [
      '这次，我看到了草原。那里的天比别处的更可爱，空气是那么清鲜，天空是那么明朗，使我总想高歌一曲，表示我满心的愉快。',
      '在天底下，一碧千里，而并不茫茫。四面都有小丘，平地是绿的，小丘也是绿的。羊群一会儿上了小丘，一会儿又下来，走在哪里都像给无边的绿毯绣上了白色的大花。',
      '那些小丘的线条是那么柔美，就像只用绿色渲染，不用墨线勾勒的中国画那样，到处翠色欲流，轻轻流入云际。',
      '这种境界，既使人惊叹，又叫人舒服，既愿久立四望，又想坐下低吟一首奇丽的小诗。',
      '在这境界里，连骏马和大牛都有时候静立不动，好像回味着草原的无限乐趣。',
      '我们访问的是陈巴尔虎旗。汽车走了一百五十里，才到达目的地。一百五十里全是草原。再走一百五十里，也还是草原。',
    ],
  },
  {
    id: 'chang-zheng-lu-shang',
    title: '长征路上的篝火',
    language: 'zh',
    grade: '六年级上',
    unit: '第二单元 · 革命岁月',
    source: '自编主题长文（第二单元）',
    goal: '长篇课文约 280 字，练习叙事段落和人物对话。',
    long: true,
    segments: [
      '队伍走进草地的时候，天已经黑了。战士们把仅有的干柴拢在一起，点起一小堆篝火。火光很弱，却把每个人的脸照得暖暖的。',
      '老班长把最后一把青稞面倒进锅里，又添了几瓢雪水。他笑着说：“今天多煮一会儿，明天就有力气走出草地了。”',
      '小战士发现老班长的干粮袋是空的，悄悄把自己的半块饼塞过去。老班长又推回来，说：“你还小，要多吃一点。”',
      '夜里下起了雨，篝火几次要灭。大家轮流用身体挡住风，把火苗护在中间。火光像一颗小小的星，照着他们继续向前。',
      '第二天清晨，队伍重新出发。老班长走在最前面，回头数了数人数，一个也不少。他笑着说：“只要火还在，路就还在。”',
    ],
  },
  {
    id: 'zhu-jie-ren',
    title: '竹节人的小战场',
    language: 'zh',
    grade: '六年级上',
    unit: '第三单元 · 有目的地阅读',
    source: '自编主题长文（第三单元）',
    goal: '长篇课文约 270 字，练习动作和场景描写。',
    long: true,
    segments: [
      '放学后，我们把书包往墙边一放，就在院子里摆开了竹节人的战场。竹节人是自己做的，用毛笔杆锯成一截一截，再用线串起来。',
      '我给我的竹节人画上眼睛和嘴巴，还给它戴了一顶纸做的小帽子。同桌的竹节人更神气，手里握着一根细细的竹签，像拿着一把长枪。',
      '比赛开始，两个竹节人在桌面上摇摇晃晃地站起来。我们蹲在桌边，一人拉一根线，谁也不敢用力过猛。',
      '我的竹节人突然向前一扑，把对手的帽子挑了下来。院子里响起一片笑声，连路过的大人也停下来看。',
      '天黑了，我们才想起回家。竹节人收进书包，战场留在院子里。第二天放学，新的比赛又会开始。',
    ],
  },
  {
    id: 'qiao-bian-de-lao-han',
    title: '桥边的老汉',
    language: 'zh',
    grade: '六年级上',
    unit: '第四单元 · 小说',
    source: '自编主题长文（第四单元）',
    goal: '长篇课文约 290 字，练习紧张场景和人物动作。',
    long: true,
    segments: [
      '洪水来的那个夜晚，村子里的桥只剩下一道窄窄的桥面。老汉站在桥头，像一根钉在那里的木桩，指挥村民一个一个过桥。',
      '有人想挤到前面，老汉一把把他拉回来，大声说：“排好队，谁也不能抢先！”他的声音压过了雨声和水声。',
      '水越涨越高，桥开始摇晃。老汉把最后一个孩子推上桥，自己却留在了桥头。他回头看了一眼村子，什么也没说。',
      '天亮时，洪水退了。村民们在河边找到了老汉，他还保持着站立的姿势。那座桥已经不见了，可大家都记得桥边的身影。',
      '后来，村里重新修了一座桥。桥头立着一块小石碑，上面没有写名字，只刻着一句话：“把别人送过河的人，永远在桥上。”',
    ],
  },
  {
    id: 'xia-tian-li-de-cheng-zhang',
    title: '夏天里的成长',
    language: 'zh',
    grade: '六年级上',
    unit: '第五单元 · 围绕中心意思写',
    source: '自编主题长文（第五单元）',
    goal: '长篇课文约 270 字，练习围绕一个意思写清楚。',
    long: true,
    segments: [
      '夏天是万物生长的季节。院子里的向日葵一天比一天高，早上还朝着东边，傍晚就把脸转向了西边。',
      '墙角的丝瓜藤顺着竹竿往上爬，叶子一片挨着一片，把整面墙都染成了绿色。奶奶说，夏天不等人，植物都在抓紧时间长大。',
      '我也在长。去年的裤子短了一截，鞋子也挤脚了。妈妈说：“不光个子在长，心眼也要跟着长。”',
      '暑假里，我学会了煮饭、浇花，还学会了照顾生病的奶奶。原来长大不只是身体变化，也是能替别人做一点事。',
      '夏天的雨来得快，去得也快。雨后的院子里，一切都在往上长。我站在屋檐下，听见自己心里也有什么东西在拔节。',
    ],
  },
  {
    id: 'wo-men-zhi-you-yi-ge-di-qiu',
    title: '我们只有一个地球',
    language: 'zh',
    grade: '六年级上',
    unit: '第六单元 · 保护环境',
    source: '自编主题长文（第六单元）',
    goal: '长篇课文约 240 字，练习说明和倡议类段落。',
    long: true,
    segments: [
      '从太空看，地球是一颗蓝色的星球。它有广阔的海洋、绿色的森林和白色的云层，看上去安静又美丽。',
      '可是，地球的资源并不是无限的。森林被砍伐，河流被污染，空气变得浑浊，许多动物失去了家园。',
      '我们可以从身边的小事做起：随手关灯，节约用水，少用一次性用品，把垃圾分类投放。',
      '周末，我和同学在小区里种下一排小树。树苗很细，风一吹就摇，可我们还是一桶一桶地给它浇水。',
      '老师说，保护地球不是为了别人，而是为了我们自己。我们只有一个地球，不能等失去了才懂得珍惜。',
    ],
  },
  {
    id: 'yue-guang-xia-de-qin-sheng',
    title: '月光下的琴声',
    language: 'zh',
    grade: '六年级上',
    unit: '第七单元 · 艺术之美',
    source: '自编主题长文（第七单元）',
    goal: '长篇课文约 260 字，练习写人记事的完整段落。',
    long: true,
    segments: [
      '深夜，小镇的街道已经安静下来。一间小屋里还亮着灯，一个年轻人坐在旧钢琴前，反复弹着同一段旋律。',
      '他很穷，买不起新的琴谱，只能把借来的谱子一笔一笔抄在纸上。手指磨出了茧，他也没有停下来。',
      '一天晚上，一位老人路过窗外，听见了琴声。他站了很久，最后轻轻敲了敲门，说：“孩子，你弹得真好。”',
      '老人把自己珍藏的琴谱送给了年轻人，还告诉他：“音乐不是用来比赛的，是用来把心里的话说给别人听。”',
      '后来，年轻人成了一名钢琴老师。他常常对学生讲起那个月光下的夜晚，也把那本旧琴谱传了下去。',
    ],
  },
  {
    id: 'cong-cong',
    title: '匆匆（长片段）',
    language: 'zh',
    grade: '六年级下',
    unit: '第三单元 · 匆匆',
    source: '朱自清《匆匆》（公版课文片段）',
    goal: '长篇课文约 350 字，练习问号、破折号和长句的节奏。',
    long: true,
    segments: [
      '燕子去了，有再来的时候；杨柳枯了，有再青的时候；桃花谢了，有再开的时候。',
      '但是，聪明的，你告诉我，我们的日子为什么一去不复返呢？——是有人偷了他们罢：那是谁？又藏在何处呢？是他们自己逃走了罢：现在又到了哪里呢？',
      '我不知道他们给了我多少日子；但我的手确乎是渐渐空虚了。',
      '在默默里算着，八千多日子已经从我手中溜去；像针尖上一滴水滴在大海里，我的日子滴在时间的流里，没有声音，也没有影子。',
      '我不禁头涔涔而泪潸潸了。去的尽管去了，来的尽管来着；去来的中间，又怎样地匆匆呢？',
      '早上我起来的时候，小屋里射进两三方斜斜的太阳。太阳他有脚啊，轻轻悄悄地挪移了；我也茫茫然跟着旋转。',
      '于是——洗手的时候，日子从水盆里过去；吃饭的时候，日子从饭碗里过去；默默时，便从凝然的双眼前过去。',
    ],
  },
  {
    id: 'shao-nian-run-tu',
    title: '少年闰土（长片段）',
    language: 'zh',
    grade: '六年级上',
    unit: '第八单元 · 少年闰土',
    source: '鲁迅《少年闰土》（公版课文片段）',
    goal: '长篇课文约 350 字，练习人物描写的长句。',
    long: true,
    segments: [
      '深蓝的天空中挂着一轮金黄的圆月，下面是海边的沙地，都种着一望无际的碧绿的西瓜。',
      '其间有一个十一二岁的少年，项带银圈，手捏一柄钢叉，向一匹猹尽力的刺去，那猹却将身一扭，反从他的胯下逃走了。',
      '这少年便是闰土。我认识他时，也不过十多岁，离现在将有三十年了；那时我的父亲还在世，家景也好，我正是一个少爷。',
      '那一年，我家是一件大祭祀的值年。这祭祀，说是三十多年才能轮到一回，所以很郑重；正月里供祖像，供品很多，祭器很讲究，拜的人也很多，祭器也很要防偷去。',
      '我家只有一个忙月，忙不过来，他便对父亲说，可以叫他的儿子闰土来管祭器的。',
      '我的父亲允许了；我也很高兴，因为我早听到闰土这名字，而且知道他和我仿佛年纪，闰月生的，五行缺土，所以他的父亲叫他闰土。',
      '他是能装弶捉小鸟雀的。我于是日日盼望新年，新年到，闰土也就到了。',
    ],
  },
  {
    id: 'bei-jing-de-chun-jie',
    title: '北京的春节（长片段）',
    language: 'zh',
    grade: '六年级下',
    unit: '第一单元 · 北京的春节',
    source: '老舍《北京的春节》（公版课文片段）',
    goal: '长篇课文约 330 字，练习说明性段落的连续输入。',
    long: true,
    segments: [
      '照北京的老规矩，春节差不多在腊月的初旬就开始了。“腊七腊八，冻死寒鸦”，这是一年里最冷的时候。',
      '在腊八这天，家家都熬腊八粥。粥是用各种米，各种豆，与各种干果熬成的。这不是粥，而是小型的农业展览会。',
      '除此之外，这一天还要泡腊八蒜。把蒜瓣放进醋里，封起来，为过年吃饺子用。到年底，蒜泡得色如翡翠，醋也有了些辣味，色味双美，使人忍不住要多吃几个饺子。',
      '在北京，过年时，家家吃饺子。孩子们准备过年，第一件大事就是买杂拌儿。这是用花生、胶枣、榛子、栗子等干果与蜜饯掺和成的。孩子们喜欢吃这些零七八碎儿。',
      '第二件大事是买爆竹，特别是男孩子们。恐怕第三件事才是买各种玩意儿——风筝、空竹、口琴等。',
      '孩子们欢喜，大人们也忙乱。他们必须预备过年吃的、喝的、穿的、用的，好在新年时显出万象更新的气象。',
    ],
  },
  {
    id: 'huang-dao-shang-de-lu-bin-xun',
    title: '荒岛上的鲁滨逊',
    language: 'zh',
    grade: '六年级下',
    unit: '第二单元 · 外国文学名著',
    source: '自编主题长文（第二单元）',
    goal: '长篇课文约 250 字，练习长句和人物心理。',
    long: true,
    segments: [
      '船在风暴中撞上了礁石，只有鲁滨逊一个人游到了荒岛。他站在沙滩上，望着茫茫的大海，不知道明天会怎样。',
      '他先找到淡水，又用船上的木板搭了一个小棚子。没有工具，他就用石头和贝壳一点一点地磨。',
      '他学会了种麦子、养山羊，还给自己做了一张桌子和一把椅子。日子很慢，但他每天都让自己忙起来。',
      '有一天，他在沙滩上发现了陌生人的脚印。他害怕过，也犹豫过，最后还是决定勇敢地面对。',
      '很多年以后，一艘船经过荒岛，把他带回了家乡。鲁滨逊说：“在岛上，我学会的最重要的事，是不放弃。”',
    ],
  },
  {
    id: 'jin-se-de-yu-gou',
    title: '金色的鱼钩',
    language: 'zh',
    grade: '六年级下',
    unit: '第四单元 · 理想和信念',
    source: '自编主题长文（第四单元）',
    goal: '长篇课文约 240 字，练习叙事和细节描写。',
    long: true,
    segments: [
      '长征途中，老班长带着三个小战士走进草地。粮食很快就吃完了，大家只能挖野菜、嚼草根。',
      '老班长把缝衣针弯成鱼钩，在水塘边钓鱼。鱼汤煮好了，他总说自己已经吃过，只把汤端给小战士。',
      '小战士发现老班长在偷偷嚼剩下的鱼骨头，眼睛一下子红了。老班长却笑着说：“我年纪大，扛得住。”',
      '走出草地的前一天，老班长倒下了。他手里还握着那枚鱼钩，鱼钩在阳光下闪着金色的光。',
      '后来，小战士把那枚鱼钩保存了下来。他说，那不是一枚普通的鱼钩，而是一颗把别人放在前面的心。',
    ],
  },
  {
    id: 'zhen-li-dan-sheng-yu-yi-bai-ge-wen-hao',
    title: '真理诞生于一百个问号之后',
    language: 'zh',
    grade: '六年级下',
    unit: '第五单元 · 科学精神',
    source: '自编主题长文（第五单元）',
    goal: '长篇课文约 260 字，练习说理和举例。',
    long: true,
    segments: [
      '很多伟大的发现，都从一个普通的问题开始。苹果为什么会落地？水为什么会沸腾？这些问题看起来简单，却藏着科学的秘密。',
      '科学家没有把问号放在一边。他们观察、记录、实验，一次又一次地修改自己的想法。',
      '有一次，我在厨房里发现，热水倒进玻璃杯后，杯壁上出现了一层小水珠。我问妈妈为什么，她让我自己去找答案。',
      '我查了书，又做了几次实验，终于明白那是水蒸气遇冷凝结成的小水滴。原来，问号后面真的藏着答案。',
      '老师说，提出一个好问题，比背下一个答案更重要。只要愿意追问，真理就会在一次次探索中慢慢出现。',
    ],
  },
  {
    id: 'bi-ye-qian-de-zui-hou-yi-ke',
    title: '毕业前的最后一课',
    language: 'zh',
    grade: '六年级下',
    unit: '第六单元 · 难忘小学生活',
    source: '自编主题长文（第六单元）',
    goal: '长篇课文约 250 字，练习抒情和回忆。',
    long: true,
    segments: [
      '六年级的最后一个下午，教室里格外安静。黑板上写着“毕业快乐”四个字，旁边画满了我们自己的名字。',
      '老师没有讲课，只是让我们每人说一句最想说的话。有人感谢同桌，有人说起第一次考砸时的眼泪。',
      '轮到我时，我忽然不知道该说什么。最后我只说：“谢谢老师，谢谢大家一起长大。”',
      '放学铃响了，谁也没有马上离开。我们把椅子摆好，把黑板擦干净，像往常一样，却又知道这是最后一次。',
      '走出校门时，我回头看了一眼教学楼。窗户里还有灯光，操场上的风把树叶吹得沙沙响。我知道，新的学期会在别处开始。',
    ],
  },
  {
    id: 'how-can-i-get-there',
    title: 'How Can I Get There?',
    language: 'en',
    grade: '六年级上',
    unit: 'Unit 1 · How can I get there?',
    source: 'PEP 六年级上册单元主题（自编长文）',
    goal: '练习问路、指路和地点方位表达。',
    long: true,
    segments: [
      'Lily wants to visit the science museum this Saturday.',
      'She asks her friend Tom how to get there.',
      "Tom says, 'Go straight along this street and turn left at the second crossing.'",
      'The museum is next to a big bookstore. It is between the post office and the cinema.',
      'Lily takes the No. 5 bus and gets off at the museum stop.',
      'She sees a tall building with a blue roof. She is very excited.',
      "'It is easy to find,' she says. 'I can draw a map for my parents, too.'",
    ],
  },
  {
    id: 'my-weekend-plan',
    title: 'My Weekend Plan',
    language: 'en',
    grade: '六年级上',
    unit: 'Unit 3 · My weekend plan',
    source: 'PEP 六年级上册单元主题（自编短文）',
    goal: '练习一般将来时句子和常用周末活动词组。',
    long: true,
    segments: [
      'My name is Lily. This weekend I am going to visit my grandparents.',
      'We are going to have dinner together.',
      'On Sunday morning, I will read a comic book and do my homework.',
      'I think it will be a happy weekend.',
    ],
  },
  {
    id: 'ways-to-school',
    title: 'Ways to Go to School',
    language: 'en',
    grade: '六年级上',
    unit: 'Unit 2 · Ways to go to school',
    source: 'PEP 六年级上册单元主题（自编短文）',
    goal: '练习交通方式和 must 句型。',
    long: true,
    segments: [
      'I usually go to school by bus.',
      'My friend Tom goes to school on foot, because his home is near the school.',
      'We must slow down and stop at a red light.',
      'We must wait at a yellow light and go at a green light.',
    ],
  },
  {
    id: 'my-pen-pal',
    title: 'My Pen Pal',
    language: 'en',
    grade: '六年级上',
    unit: 'Unit 4 · I have a pen pal',
    source: 'PEP 六年级上册单元主题（自编短文）',
    goal: '练习 like doing 结构和人物介绍。',
    long: true,
    segments: [
      'I have a pen pal in Canada. His name is Peter.',
      'He likes reading stories and doing kung fu.',
      'He also likes singing and dancing.',
      'Every week we write emails to each other. I am happy to have a pen pal.',
      'We often talk about our favorite books and sports.',
    ],
  },
  {
    id: 'what-does-he-do',
    title: 'What Does He Do?',
    language: 'en',
    grade: '六年级上',
    unit: 'Unit 5 · What does he do?',
    source: 'PEP 六年级上册单元主题（自编长文）',
    goal: '练习职业名称和工作地点。',
    long: true,
    segments: [
      'My uncle works in a big hospital. He is a doctor.',
      'He gets up early every morning and drives to work.',
      'He helps sick people and talks to their families.',
      'My aunt is a teacher. She works in a primary school.',
      'She teaches English and tells her students funny stories.',
      'My cousin wants to be a pilot. He likes planes very much.',
      'He says he will study hard and travel around the world.',
    ],
  },
  {
    id: 'how-do-you-feel',
    title: 'How Do You Feel?',
    language: 'en',
    grade: '六年级上',
    unit: 'Unit 6 · How do you feel?',
    source: 'PEP 六年级上册单元主题（自编长文）',
    goal: '练习情绪表达和关心他人。',
    long: true,
    segments: [
      'Today is Monday. Lily feels happy because she has a new pen pal.',
      'In the morning, she gets a letter from Peter. He lives in Canada.',
      "At lunch, Lily's friend Amy looks sad. She lost her favorite book.",
      'Lily shares her apple with Amy and helps her look for the book.',
      'In the afternoon, they find the book under a chair. Amy feels excited.',
      'After school, it starts to rain. Lily is worried because she forgot her umbrella.',
      'But her father comes to pick her up. She feels warm and safe.',
    ],
  },
  {
    id: 'how-tall-are-you',
    title: 'How Tall Are You?',
    language: 'en',
    grade: '六年级下',
    unit: 'Unit 1 · How tall are you?',
    source: 'PEP 六年级下册单元主题（自编短文）',
    goal: '练习比较级和身高、年龄的表达。',
    long: true,
    segments: [
      'I am twelve years old. I am 1.55 metres tall.',
      'My brother is taller than me. He is 1.68 metres.',
      'My sister is younger, but she is heavier than me.',
      'My father is the tallest in our family. He is 1.75 metres.',
      'We are different, and we are a happy family.',
    ],
  },
  {
    id: 'last-weekend',
    title: 'Last Weekend',
    language: 'en',
    grade: '六年级下',
    unit: 'Unit 2 · Last weekend',
    source: 'PEP 六年级下册单元主题（自编短文）',
    goal: '练习一般过去时和活动短语。',
    long: true,
    segments: [
      'Last Saturday, I visited my aunt.',
      'We cleaned the room and washed the clothes.',
      'In the afternoon, we went to the park and saw a film.',
      'I went to bed early because I was tired.',
      'On Sunday, I helped my mother cook lunch and walked the dog.',
    ],
  },
  {
    id: 'where-did-you-go',
    title: 'Where Did You Go?',
    language: 'en',
    grade: '六年级下',
    unit: 'Unit 3 · Where did you go?',
    source: 'PEP 六年级下册单元主题（自编长文）',
    goal: '练习旅行经历和一般过去时。',
    long: true,
    segments: [
      'Last summer, Lily went to Hainan with her family.',
      'They flew there and stayed in a small hotel near the beach.',
      'Every morning, Lily swam in the sea and picked up shells.',
      'One afternoon, they visited a fishing village and ate fresh fish.',
      'It rained heavily one day, so they stayed in the hotel and played cards.',
      'Lily took many photos and bought a small gift for her friend.',
      'She says Hainan is beautiful, and she wants to go there again.',
    ],
  },
  {
    id: 'a-special-weekend',
    title: 'A Special Weekend',
    language: 'en',
    grade: '六年级下',
    unit: 'Unit 2 · Last weekend',
    source: 'PEP 六年级下册单元主题（自编长文）',
    goal: '用一篇较长的英语短文练习过去时和段落衔接。',
    long: true,
    segments: [
      'Last Friday, Lily and her family went to the countryside.',
      'They left home early in the morning and drove for two hours.',
      'The weather was sunny and the air was fresh.',
      'In the afternoon, they visited a small farm.',
      'Lily fed the chickens and picked some apples.',
      'Her brother rode a horse for the first time.',
      'In the evening, they had a picnic by the lake.',
      'Lily took many photos and wrote a short diary.',
      'She said the weekend was tiring but wonderful.',
    ],
  },
  {
    id: 'a-trip-to-the-science-museum',
    title: 'A Trip to the Science Museum',
    language: 'en',
    grade: '六年级下',
    unit: 'Unit 1 · How tall are you?',
    source: 'PEP 六年级下册单元主题（自编长文）',
    goal: '用一篇约 450 字符的英语长文练习过去时和科学主题词汇。',
    long: true,
    segments: [
      'Last Sunday, Lily and her classmates visited the science museum.',
      'They met at the school gate at eight and took a bus together.',
      'Lily learned that the sun is much bigger than the earth.',
      'Then they saw a room full of robots.',
      'One robot could draw, and another could answer questions.',
      'Lily asked how to become a scientist.',
      "The robot said, 'Read more books and never stop asking questions.'",
      'In the afternoon, they did an experiment with water and light.',
      'Lily bought a small model rocket before she went home.',
    ],
  },
  {
    id: 'then-and-now',
    title: 'Then and Now',
    language: 'en',
    grade: '六年级下',
    unit: 'Unit 4 · Then and now',
    source: 'PEP 六年级下册单元主题（自编短文）',
    goal: '练习 there be 句型和过去与现在的对比。',
    long: true,
    segments: [
      'Ten years ago, my school was small.',
      'There was no gym and no library.',
      'Now there is a big gym and a new library.',
      'Students can read books and play basketball. Our school is changing for the better.',
      'There are more trees and flowers, too. I love my school.',
    ],
  },
]

/** 长篇课文优先，古诗与文言文排在各自语言的后半段。 */
export function orderedPassages() {
  return [...passages].sort((a, b) => Number(!!b.long) - Number(!!a.long))
}

export function passageById(id: string) {
  return passages.find((item) => item.id === id) ?? passages[0]
}

/** 把家长粘贴的长文切成不超过 90 字的练习段，中文按长度、英文尽量按空格断开。 */
export function splitPassageText(text: string): string[] {
  const lines = text
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const chunks: string[] = []
  for (const line of lines) {
    let rest = line
    while (rest.length > 90) {
      const space = rest.lastIndexOf(' ', 80)
      const cut = space > 20 ? space : 80
      chunks.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    if (rest) chunks.push(rest)
  }
  return chunks
}

export function passageLevels(language?: 'zh' | 'en') {
  return orderedPassages()
    .filter((item) => item.long && (!language || item.language === language))
    .map((item) => ({
      id: item.id,
      title: `${item.title} · ${item.grade}`,
      version: 1,
      goal: item.goal,
      discovery: `${item.unit}｜${item.source}。一段一段来，打完再进入下一段。`,
      tasks: item.segments.map((target) => ({ target })),
    }))
}
