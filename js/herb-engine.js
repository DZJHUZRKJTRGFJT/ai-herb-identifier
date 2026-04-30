/**
 * 灵草鉴 - 纯前端药材识别引擎 v1.0
 * 
 * 使用 Canvas API 进行像素级颜色分析（替代 Node.js sharp 库）
 * 完整移植 server.js v5.0 的识别逻辑，无需后端即可运行
 * 
 * 识别策略（按优先级）:
 * 1. 后端API（如果 server.js 正在运行）
 * 2. 前端 Canvas 像素级颜色分析 + 知识库匹配
 */

// ===================== 中药材知识库 =====================
const herbKnowledgeBase = [
  { name: '人参', latinName: 'Panax ginseng C.A.Mey.', family: '五加科', category: '补虚药', nature: '温', flavor: '甘、微苦', meridian: '脾、肺、心、肾经', part: '根及根茎', origin: '吉林、辽宁、黑龙江', dosage: '3-9g',
    efficacy: '大补元气，复脉固脱，补脾益肺，生津养血，安神益智。用于体虚欲脱，肢冷脉微，脾虚食少，肺虚喘咳，津伤口渴，内热消渴，气血亏虚，久病虚羸，惊悸失眠，阳痿宫冷。',
    identification: '主根呈纺锤形或圆柱形，表面灰黄色，有疏浅断续的粗横纹及明显的纵皱。根茎（芦头）多拘挛而弯曲，具不定根（艼）和稀疏的凹窝状茎痕（芦碗）。质较硬，断面淡黄白色，显粉性，形成层环纹棕黄色。',
    contraindication: '不宜与藜芦、五灵脂同用。实证、热证而正气不虚者忌服。',
    similarHerbs: [{ name: '西洋参', confidence: '12.4' }, { name: '红参', confidence: '5.8' }, { name: '党参', confidence: '2.1' }],
    colorProfile: { dominant: ['yellow-brown', 'beige', 'white'], secondary: ['pale-yellow', 'gray-brown'] },
    shapeHint: 'spindle/cylindrical root with transverse streaks',
    keywords: ['人参', 'ginseng', '五加科', '芦头', '芦碗', '纺锤形', '须根', '灰黄色', '横纹'] },
  { name: '黄芪', latinName: 'Astragalus membranaceus', family: '豆科', category: '补虚药', nature: '温', flavor: '甘', meridian: '脾、肺经', part: '根', origin: '甘肃、内蒙古、山西', dosage: '9-30g',
    efficacy: '补气升阳，固表止汗，利水消肿，生津养血，行滞通痹，托毒排脓，敛疮生肌。用于气虚乏力，食少便溏，中气下陷，久泻脱肛。',
    identification: '呈圆柱形，表面淡棕黄色或淡棕褐色，有不整齐的纵皱纹或纵沟。质硬而韧，断面纤维性强，并显粉性，皮部黄白色，木部淡黄色，有菊花心。',
    contraindication: '表实邪盛、内有积滞、阴虚阳亢者不宜用。',
    similarHerbs: [{ name: '红芪', confidence: '15.2' }, { name: '苦参', confidence: '3.1' }],
    colorProfile: { dominant: ['light-brown', 'pale-yellow', 'cream'], secondary: ['white', 'yellow-white'] },
    shapeHint: 'long cylindrical root with fibrous cross-section',
    keywords: ['黄芪', 'astragalus', '豆科', '菊花心', '纤维性', '圆柱形', '补气', '淡棕'] },
  { name: '当归', latinName: 'Angelica sinensis (Oliv.) Diels', family: '伞形科', category: '补虚药', nature: '温', flavor: '甘、辛', meridian: '肝、心、脾经', part: '根', origin: '甘肃、云南、四川', dosage: '6-12g',
    efficacy: '补血活血，调经止痛，润肠通便。用于血虚萎黄，眩晕心悸，月经不调，经闭痛经，虚寒腹痛，风湿痹痛，跌扑损伤，痈疽疮疡，肠燥便秘。',
    identification: '略呈圆柱形，下部有支根3-5条或更多。表面黄棕色至棕褐色，具纵皱纹及横长皮孔样突起。质柔韧，断面黄白色或淡黄棕色，皮部厚，有裂隙及多数棕色点状分泌腔。',
    contraindication: '湿盛中满、大便泄泻者忌服。',
    similarHerbs: [{ name: '独活', confidence: '8.5' }, { name: '白芷', confidence: '4.2' }],
    colorProfile: { dominant: ['brown', 'dark-brown', 'tan'], secondary: ['yellow-white', 'amber'] },
    shapeHint: 'cylindrical root with multiple branching rootlets',
    keywords: ['当归', 'angelica', '伞形科', '补血', '调经', '支根', '分泌腔', '棕褐色'] },
  { name: '金银花', latinName: 'Lonicera japonica Thunb.', family: '忍冬科', category: '清热药', nature: '寒', flavor: '甘', meridian: '肺、心、胃经', part: '花蕾或带初开的花', origin: '山东、河南、河北', dosage: '6-15g',
    efficacy: '清热解毒，疏散风热。用于痈肿疔疮，喉痹，丹毒，热毒血痢，风热感冒，温病发热。',
    identification: '呈棒状，上粗下细，略弯曲。表面黄白色或绿白色，密被短柔毛。花萼绿色，先端5裂。气清香，味淡、微苦。',
    contraindication: '脾胃虚寒及气虚疮疡脓清者忌服。',
    similarHerbs: [{ name: '山银花', confidence: '18.3' }, { name: '菊花', confidence: '6.7' }],
    colorProfile: { dominant: ['white', 'yellow-white', 'pale-green'], secondary: ['green', 'golden'] },
    shapeHint: 'slender tubular flower buds, white/yellow color',
    keywords: ['金银花', 'lonicera', '忍冬科', '清热', '解毒', '花蕾', '黄白色', '绿白色', '棒状'] },
  { name: '枸杞子', latinName: 'Lycium barbarum L.', family: '茄科', category: '补虚药', nature: '平', flavor: '甘', meridian: '肝、肾经', part: '成熟果实', origin: '宁夏、甘肃、青海', dosage: '6-12g',
    efficacy: '滋补肝肾，益精明目。用于虚劳精亏，腰膝酸痛，眩晕耳鸣，阳萎遗精，内热消渴，血虚萎黄，目昏不明。',
    identification: '呈类纺锤形或椭圆形，表面红色或暗红色，顶端有小突起状的花柱痕。果皮柔韧，皱缩；果肉肉质，柔润。种子类肾形。气微，味甜。',
    contraindication: '外邪实热、脾虚有湿及泄泻者忌服。',
    similarHerbs: [{ name: '地骨皮', confidence: '5.1' }],
    colorProfile: { dominant: ['red', 'dark-red', 'orange-red'], secondary: ['crimson', 'maroon'] },
    shapeHint: 'small elongated oval/ellipsoid red berries',
    keywords: ['枸杞', 'lycium', '茄科', '滋补', '肝肾', '红色', '果实', '甜', '纺锤形'] },
  { name: '川芎', latinName: 'Ligusticum chuanxiong Hort.', family: '伞形科', category: '活血化瘀药', nature: '温', flavor: '辛', meridian: '肝、胆、心包经', part: '根茎', origin: '四川、贵州、云南', dosage: '3-10g',
    efficacy: '活血行气，祛风止痛。用于胸痹心痛，胸胁刺痛，跌扑肿痛，月经不调，经闭痛经，癥瘕腹痛，头痛，风湿痹痛。',
    identification: '为不规则结节状拳形团块。表面黄褐色，粗糙皱缩，有多数平行隆起的轮节。质坚实，断面黄白色或灰黄色，散有黄棕色的油室。',
    contraindication: '阴虚火旺、多汗及月经过多者慎用。',
    similarHerbs: [{ name: '藁本', confidence: '10.3' }, { name: '防风', confidence: '4.6' }],
    colorProfile: { dominant: ['yellow-brown', 'gray-yellow', 'brown'], secondary: ['white-yellow', 'amber'] },
    shapeHint: 'irregular fist-shaped nodular mass',
    keywords: ['川芎', 'ligusticum', '伞形科', '活血', '拳形', '结节', '油室', '黄褐色'] },
  { name: '茯苓', latinName: 'Poria cocos (Schw.) Wolf', family: '多孔菌科', category: '利水渗湿药', nature: '平', flavor: '甘、淡', meridian: '心、肺、脾、肾经', part: '菌核', origin: '安徽、云南、湖北', dosage: '10-15g',
    efficacy: '利水渗湿，健脾，宁心。用于水肿尿少，痰饮眩悸，脾虚食少，便溏泄泻，心神不安，惊悸失眠。',
    identification: '呈类球形、椭圆形或不规则块状。外皮薄而粗糙，棕褐色至黑褐色。体重，质坚实，断面颗粒性，外层淡棕色，内部白色。',
    contraindication: '阴虚而无湿热、虚寒精滑者慎服。',
    similarHerbs: [{ name: '猪苓', confidence: '14.7' }, { name: '薏苡仁', confidence: '6.2' }],
    colorProfile: { dominant: ['white', 'cream', 'off-white'], secondary: ['brown', 'dark-brown'] },
    shapeHint: 'spherical/irregular block, white inside, brown outside',
    keywords: ['茯苓', 'poria', '菌核', '利水', '渗湿', '白色', '颗粒性', '球形'] },
  { name: '丹参', latinName: 'Salvia miltiorrhiza Bge.', family: '唇形科', category: '活血化瘀药', nature: '微寒', flavor: '苦', meridian: '心、肝经', part: '根及根茎', origin: '四川、山东、河南', dosage: '10-15g',
    efficacy: '活血祛瘀，通经止痛，清心除烦，凉血消痈。用于胸痹心痛，脘腹胁痛，癥瘕积聚，热痹疼痛，心烦不眠，月经不调，痛经经闭，疮疡肿痛。',
    identification: '根数条，长圆柱形，略弯曲。表面棕红色或暗棕红色，粗糙，具纵皱纹。质硬而脆，断面疏松，皮部棕红色，木部灰黄色或紫褐色。',
    contraindication: '不宜与藜芦同用。孕妇慎用。',
    similarHerbs: [{ name: '赤芍', confidence: '11.8' }, { name: '川芎', confidence: '5.3' }],
    colorProfile: { dominant: ['red-brown', 'dark-red', 'purple-brown'], secondary: ['gray-yellow', 'brick-red'] },
    shapeHint: 'long cylindrical roots, red-brown surface',
    keywords: ['丹参', 'salvia', '唇形科', '活血', '棕红色', '紫褐色', '圆柱形'] },
  { name: '麻黄', latinName: 'Ephedra sinica Stapf', family: '麻黄科', category: '解表药', nature: '温', flavor: '辛、微苦', meridian: '肺、膀胱经', part: '草质茎', origin: '内蒙古、山西、河北', dosage: '2-10g',
    efficacy: '发汗散寒，宣肺平喘，利水消肿。用于风寒感冒，胸闷喘咳，风水浮肿。',
    identification: '呈细长圆柱形，少分枝。表面淡绿色至黄绿色，有细纵脊线。节明显，节上有膜质鳞叶，裂片2，先端灰白色，锐三角形。',
    contraindication: '体虚自汗、阴虚盗汗及喘咳由于肾不纳气者忌服。高血压患者慎用。',
    similarHerbs: [{ name: '木贼', confidence: '9.6' }],
    colorProfile: { dominant: ['green', 'yellow-green', 'pale-green'], secondary: ['white-gray', 'tan'] },
    shapeHint: 'slender cylindrical green stems with nodes',
    keywords: ['麻黄', 'ephedra', '麻黄科', '解表', '发汗', '绿色', '草质茎', '节'] },
  { name: '黄连', latinName: 'Coptis chinensis Franch.', family: '毛茛科', category: '清热药', nature: '寒', flavor: '苦', meridian: '心、脾、胃、肝、胆、大肠经', part: '根茎', origin: '四川、湖北、云南', dosage: '2-5g',
    efficacy: '清热燥湿，泻火解毒。用于湿热痞满，呕吐吞酸，泻痢，黄疸，高热神昏，心火亢盛，心烦不寐，血热吐衄，目赤，牙痛，消渴，痈肿疔疮。',
    identification: '多集聚成簇，形如鸡爪。表面灰黄色或黄褐色，粗糙。质硬，断面不整齐，皮部橙红色或暗棕色，木部鲜黄色或橙黄色，呈放射状排列。',
    contraindication: '脾胃虚寒者忌用；阴虚津伤者慎用。',
    similarHerbs: [{ name: '胡黄连', confidence: '16.4' }, { name: '黄柏', confidence: '8.2' }],
    colorProfile: { dominant: ['yellow', 'orange-yellow', 'golden'], secondary: ['gray-yellow', 'orange-red'] },
    shapeHint: 'cluster of curved rhizomes resembling chicken claws',
    keywords: ['黄连', 'coptis', '毛茛科', '清热', '燥湿', '鸡爪', '黄色', '橙红色'] },
  { name: '半夏', latinName: 'Pinellia ternata (Thunb.) Breit.', family: '天南星科', category: '化痰止咳药', nature: '温', flavor: '辛', meridian: '脾、胃、肺经', part: '块茎', origin: '四川、湖北、河南', dosage: '3-9g',
    efficacy: '燥湿化痰，降逆止呕，消痞散结。用于湿痰寒痰，咳喘痰多，痰饮眩悸，风痰眩晕，痰厥头痛，呕吐反胃，胸脘痞闷，梅核气。',
    identification: '呈类球形，有的稍偏斜。表面白色或浅黄色，顶端有凹陷的茎痕，周围密布麻点状根痕。质坚实，断面洁白，富粉性。',
    contraindication: '不宜与川乌、草乌、附子同用。生品内服宜慎。',
    similarHerbs: [{ name: '天南星', confidence: '13.5' }, { name: '白附子', confidence: '7.1' }],
    colorProfile: { dominant: ['white', 'cream-white', 'pale-yellow'], secondary: ['off-white', 'ivory'] },
    shapeHint: 'spherical tuber with dotted root scars',
    keywords: ['半夏', 'pinellia', '天南星科', '化痰', '球形', '白色', '粉性', '麻点'] },
  { name: '酸枣仁', latinName: 'Ziziphus jujuba Mill. var. spinosa', family: '鼠李科', category: '安神药', nature: '平', flavor: '甘、酸', meridian: '肝、胆、心经', part: '成熟种子', origin: '河北、陕西、辽宁', dosage: '10-15g',
    efficacy: '养心补肝，宁心安神，敛汗，生津。用于虚烦不眠，惊悸多梦，体虚多汗，津伤口渴。',
    identification: '呈扁圆形或扁椭圆形。表面紫红色或紫褐色，平滑有光泽。一面较平坦，中间有1条隆起的纵线纹。种皮较脆，胚乳白色，子叶2，浅黄色，富油性。',
    contraindication: '内有实邪郁火者慎服。',
    similarHerbs: [{ name: '柏子仁', confidence: '12.3' }, { name: '远志', confidence: '5.8' }],
    colorProfile: { dominant: ['purple-red', 'purple-brown', 'mahogany'], secondary: ['brown', 'dark-red'] },
    shapeHint: 'flat round/elliptical seeds with purple-red surface',
    keywords: ['酸枣仁', 'ziziphus', '鼠李科', '安神', '紫红色', '种子', '扁圆'] },
  { name: '甘草', latinName: 'Glycyrrhiza uralensis Fisch.', family: '豆科', category: '补虚药', nature: '平', flavor: '甘', meridian: '心、肺、脾、胃经', part: '根及根茎', origin: '内蒙古、甘肃、新疆', dosage: '2-10g',
    efficacy: '补脾益气，清热解毒，祛痰止咳，缓急止痛，调和诸药。用于脾胃虚弱，倦怠乏力，心悸气短，咳嗽痰多，脘腹、四肢挛急疼痛，痈肿疮毒，缓解药物毒性、烈性。',
    identification: '呈圆柱形。表面红棕色或灰棕色，有显著的纵皱纹、沟纹及稀疏的细根痕。质坚实，断面略显纤维性，黄白色，粉性，形成层环明显，射线放射状。',
    contraindication: '不宜与海藻、京大戟、红大戟、甘遂、芫花同用。湿盛胀满、水肿者不宜用。',
    similarHerbs: [{ name: '胀果甘草', confidence: '8.9' }],
    colorProfile: { dominant: ['red-brown', 'gray-brown', 'cinnamon'], secondary: ['yellow-white', 'fibrous'] },
    shapeHint: 'long cylindrical root with fibrous cross-section',
    keywords: ['甘草', 'glycyrrhiza', '豆科', '调和诸药', '红棕色', '圆柱形', '纤维性'] },
  { name: '白术', latinName: 'Atractylodes macrocephala Koidz.', family: '菊科', category: '补虚药', nature: '温', flavor: '甘、苦', meridian: '脾、胃经', part: '根茎', origin: '浙江、安徽、湖南', dosage: '6-12g',
    efficacy: '健脾益气，燥湿利水，止汗，安胎。用于脾虚食少，腹胀泄泻，痰饮眩悸，水肿，自汗，胎动不安。',
    identification: '呈不规则肥厚团块。表面灰黄色或灰棕色，有瘤状突起及断续的纵皱和沟纹。质坚硬，不易折断，断面不平坦，黄白色至淡棕色，有棕黄色的点状油室。',
    contraindication: '阴虚燥渴、气滞胀闷者忌服。',
    similarHerbs: [{ name: '苍术', confidence: '22.1' }, { name: '白芍', confidence: '3.4' }],
    colorProfile: { dominant: ['gray-yellow', 'gray-brown', 'cream'], secondary: ['white-yellow', 'tan'] },
    shapeHint: 'irregular thick mass with warty protrusions',
    keywords: ['白术', 'atractylodes', '菊科', '健脾', '肥厚', '团块', '灰黄色', '油室'] },
  { name: '菊花', latinName: 'Chrysanthemum morifolium Ramat.', family: '菊科', category: '解表药', nature: '微寒', flavor: '甘、苦', meridian: '肺、肝经', part: '头状花序', origin: '安徽、浙江、河南', dosage: '5-10g',
    efficacy: '疏散风热，平肝明目，清热解毒。用于风热感冒，头痛眩晕，目赤肿痛，眼目昏花，疮痈肿毒。',
    identification: '呈扁球形或不规则球形。总苞由3-4层苞片组成，外围为数层舌状花，中央为管状花。体轻，质柔润。气清香，味甘、微苦。',
    contraindication: '气虚胃寒、食少泄泻者慎服。',
    similarHerbs: [{ name: '野菊花', confidence: '19.8' }, { name: '金银花', confidence: '7.3' }],
    colorProfile: { dominant: ['white', 'yellow', 'pale-yellow'], secondary: ['green', 'golden'] },
    shapeHint: 'flat spherical flower head with radiating petals',
    keywords: ['菊花', 'chrysanthemum', '菊科', '疏散风热', '花序', '舌状花', '管状花', '清香'] },
  { name: '三七', latinName: 'Panax notoginseng (Burk.) F.H.Chen', family: '五加科', category: '止血药', nature: '温', flavor: '甘、微苦', meridian: '肝、胃经', part: '根及根茎', origin: '云南、广西', dosage: '3-9g',
    efficacy: '散瘀止血，消肿定痛。用于咯血，吐血，衄血，便血，崩漏，外伤出血，胸腹刺痛，跌扑肿痛。',
    identification: '主根呈类圆锥形或圆柱形。表面灰褐色或灰黄色，有断续的纵皱纹及支根痕。顶端有茎痕，周围有瘤状突起。体重，质坚实，断面灰绿色、灰棕色或灰黑色，木部微呈放射状排列。',
    contraindication: '孕妇慎用。',
    similarHerbs: [{ name: '人参', confidence: '14.2' }, { name: '景天三七', confidence: '6.8' }],
    colorProfile: { dominant: ['gray-brown', 'gray-green', 'dark-gray'], secondary: ['brown', 'green-gray'] },
    shapeHint: 'conical root with warty protrusions at top',
    keywords: ['三七', 'notoginseng', '五加科', '止血', '散瘀', '圆锥形', '灰绿色', '瘤状'] }
];

// ===================== 颜色分类 =====================

function classifyPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const avg = (r + g + b) / 3;
  const saturation = max === 0 ? 0 : delta / max;

  if (saturation < 0.12) {
    if (avg > 210) return 'white';
    if (avg > 160) return 'light-gray';
    if (avg > 90) return 'gray';
    if (avg > 40) return 'dark-gray';
    return 'black';
  }

  let h;
  if (delta === 0) h = 0;
  else if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;

  const lightness = (max + min) / 2 / 255;

  if (h < 15 || h >= 345) {
    if (lightness < 0.25) return 'dark-red';
    if (saturation < 0.4) return 'brown';
    if (lightness > 0.6) return 'orange-red';
    return 'red';
  }
  if (h < 40) {
    if (lightness > 0.65) return 'yellow-orange';
    if (lightness < 0.3) return 'brown';
    return 'orange';
  }
  if (h < 70) {
    if (lightness > 0.75) return 'pale-yellow';
    if (lightness < 0.3) return 'dark-yellow-brown';
    return 'yellow';
  }
  if (h < 155) {
    if (lightness > 0.7) return 'pale-green';
    if (lightness < 0.25) return 'dark-green';
    if (saturation < 0.25) return 'yellow-green';
    return 'green';
  }
  if (h < 200) return 'cyan';
  if (h < 260) {
    if (lightness > 0.6) return 'light-blue';
    return 'blue';
  }
  if (h < 310) {
    if (lightness < 0.25) return 'dark-purple';
    if (lightness > 0.55) return 'lavender';
    return 'purple';
  }
  if (lightness > 0.6) return 'pink';
  return 'magenta';
}

// ===================== 语义颜色映射 =====================

const COLOR_SEMANTICS = {
  'red': ['red', 'dark-red', 'crimson', 'maroon', 'orange-red', 'magenta'],
  'brown': ['brown', 'dark-red', 'dark-yellow-brown', 'yellow-orange', 'orange'],
  'yellow': ['yellow', 'pale-yellow', 'yellow-orange', 'dark-yellow-brown'],
  'green': ['green', 'dark-green', 'pale-green', 'yellow-green', 'cyan'],
  'white': ['white', 'light-gray', 'pale-yellow', 'pale-green', 'lavender'],
  'gray': ['gray', 'dark-gray', 'light-gray'],
  'black': ['black', 'dark-gray', 'dark-green', 'dark-purple'],
  'orange': ['orange', 'yellow-orange', 'orange-red', 'brown'],
  'purple': ['purple', 'dark-purple', 'lavender', 'magenta', 'pink'],
  'blue': ['blue', 'light-blue', 'cyan'],
};

const COLOR_NAMES_CN = {
  red: '红色', 'dark-red': '暗红色', 'orange-red': '橙红色', magenta: '品红色',
  brown: '棕色', orange: '橙色', 'yellow-orange': '黄橙色',
  yellow: '黄色', 'pale-yellow': '淡黄色', 'dark-yellow-brown': '暗黄棕色',
  green: '绿色', 'dark-green': '暗绿色', 'pale-green': '浅绿色', 'yellow-green': '黄绿色', cyan: '青色',
  white: '白色', 'light-gray': '浅灰色', gray: '灰色', 'dark-gray': '深灰色', black: '黑色',
  purple: '紫色', 'dark-purple': '暗紫色', lavender: '淡紫色', pink: '粉红色',
};

const COLOR_SYNONYMS = {
  'red': ['red'], 'dark-red': ['red'], 'crimson': ['red'], 'maroon': ['red', 'brown'],
  'orange-red': ['red', 'orange'], 'brick-red': ['red', 'brown'],
  'brown': ['brown'], 'dark-brown': ['brown'], 'yellow-brown': ['brown', 'yellow'],
  'gray-brown': ['brown', 'gray'], 'red-brown': ['brown', 'red'], 'cinnamon': ['brown'],
  'tan': ['brown', 'yellow'], 'amber': ['brown', 'yellow', 'orange'],
  'yellow': ['yellow'], 'golden': ['yellow'], 'pale-yellow': ['yellow', 'white'],
  'orange-yellow': ['yellow', 'orange'], 'yellow-white': ['yellow', 'white'],
  'dark-yellow-brown': ['yellow', 'brown'],
  'green': ['green'], 'dark-green': ['green'], 'pale-green': ['green', 'white'],
  'yellow-green': ['green', 'yellow'], 'gray-green': ['green', 'gray'],
  'green-gray': ['green', 'gray'],
  'white': ['white'], 'cream': ['white', 'yellow'], 'off-white': ['white'],
  'ivory': ['white'], 'cream-white': ['white'], 'beige': ['white', 'brown'],
  'white-yellow': ['white', 'yellow'],
  'gray': ['gray'], 'light-gray': ['gray', 'white'], 'dark-gray': ['gray'],
  'gray-yellow': ['gray', 'yellow'],
  'purple': ['purple'], 'purple-red': ['purple', 'red'], 'purple-brown': ['purple', 'brown'],
  'mahogany': ['purple', 'brown', 'red'], 'dark-purple': ['purple'],
  'orange': ['orange'],
  'blue': ['blue'],
  'black': ['black'], 'dark-gray': ['gray', 'black'],
  'fibrous': [],
};

// ===================== Canvas 像素级颜色分析 =====================

/**
 * 使用 Canvas API 分析图片像素颜色分布
 * 等同于 server.js 中的 analyzeImageColorsSharp()
 */
async function analyzeImageColorsCanvas(imageBase64) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = function() {
        // 创建离屏 Canvas，缩放到 200x200 加速处理
        const canvas = document.createElement('canvas');
        const maxSize = 200;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data; // RGBA format

        // 第一步：收集所有像素颜色
        const allColors = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // data[i+3] 是 alpha，我们忽略它
          allColors.push({ r, g, b, category: classifyPixel(r, g, b) });
        }

        // 第二步：检测背景色（边缘像素分析）
        const edgePixels = [];
        const edgeWidth = 5;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (x < edgeWidth || x >= width - edgeWidth || y < edgeWidth || y >= height - edgeWidth) {
              const idx = (y * width + x) * 4;
              edgePixels.push({
                r: data[idx], g: data[idx + 1], b: data[idx + 2],
                category: classifyPixel(data[idx], data[idx + 1], data[idx + 2])
              });
            }
          }
        }

        const edgeColorCounts = {};
        edgePixels.forEach(p => {
          edgeColorCounts[p.category] = (edgeColorCounts[p.category] || 0) + 1;
        });
        const edgeTotal = edgePixels.length || 1;
        const bgCategories = Object.entries(edgeColorCounts)
          .filter(([_, count]) => count / edgeTotal > 0.3)
          .map(([cat]) => cat);

        const bgIsLight = bgCategories.some(c => ['white', 'light-gray', 'pale-yellow', 'pale-green', 'cream'].includes(c));
        const bgIsDark = bgCategories.some(c => ['black', 'dark-gray'].includes(c));

        // 第三步：过滤背景色像素
        const herbPixels = allColors.filter(p => {
          if (bgIsLight) {
            const max = Math.max(p.r, p.g, p.b);
            const min = Math.min(p.r, p.g, p.b);
            const sat = max === 0 ? 0 : (max - min) / max;
            const avg = (p.r + p.g + p.b) / 3;
            if (sat < 0.08 && avg > 200) return false;
            if (sat < 0.05 && avg > 180) return false;
          }
          if (bgIsDark) {
            const max = Math.max(p.r, p.g, p.b);
            const min = Math.min(p.r, p.g, p.b);
            const avg = (p.r + p.g + p.b) / 3;
            if (avg < 30 && (max - min) < 15) return false;
          }
          if (bgCategories.includes(p.category) && (bgIsLight || bgIsDark)) return false;
          return true;
        });

        const analysisPixels = herbPixels.length > allColors.length * 0.15 ? herbPixels : allColors;
        const totalPixels = analysisPixels.length;

        const colorCounts = {};
        analysisPixels.forEach(p => {
          colorCounts[p.category] = (colorCounts[p.category] || 0) + 1;
        });

        const colorProfile = Object.entries(colorCounts)
          .map(([color, count]) => ({ color, ratio: count / totalPixels }))
          .filter(c => c.ratio > 0.01)
          .sort((a, b) => b.ratio - a.ratio);

        const getColorRatio = (name) => {
          const semanticColors = COLOR_SEMANTICS[name] || [name];
          return semanticColors.reduce((sum, sc) => sum + (colorCounts[sc] || 0), 0) / totalPixels;
        };

        // 纹理分析
        const topColorEntropy = colorProfile.slice(0, 8).reduce((sum, c) => {
          return sum - (c.ratio > 0 ? c.ratio * Math.log2(c.ratio) : 0);
        }, 0);

        // 四象限分析
        const quadrantColors = [[], [], [], []];
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const category = classifyPixel(data[idx], data[idx + 1], data[idx + 2]);
            const qIdx = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
            quadrantColors[qIdx].push(category);
          }
        }

        const quadrantDominants = quadrantColors.map(colors => {
          const counts = {};
          colors.forEach(c => counts[c] = (counts[c] || 0) + 1);
          return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
        });
        const uniformQuadrants = new Set(quadrantDominants).size;

        const bgRatio = bgIsLight || bgIsDark
          ? edgePixels.filter(p => bgCategories.includes(p.category)).length / edgeTotal
          : 0;

        const result = {
          fileSize: Math.round(imageBase64.length * 0.75),
          format: 'image',
          width,
          height,
          dominantColors: colorProfile.slice(0, 8),
          redRatio: getColorRatio('red'),
          brownRatio: getColorRatio('brown'),
          yellowRatio: getColorRatio('yellow'),
          greenRatio: getColorRatio('green'),
          whiteRatio: getColorRatio('white'),
          grayRatio: getColorRatio('gray'),
          blackRatio: getColorRatio('black'),
          orangeRatio: getColorRatio('orange'),
          purpleRatio: getColorRatio('purple'),
          blueRatio: getColorRatio('blue'),
          isMostlyRed: getColorRatio('red') > 0.2,
          isMostlyGreen: getColorRatio('green') > 0.25,
          isMostlyWhite: getColorRatio('white') > 0.35,
          isMostlyBrown: getColorRatio('brown') > 0.25,
          isMostlyYellow: getColorRatio('yellow') > 0.2,
          isMostlyOrange: getColorRatio('orange') > 0.15,
          isMostlyPurple: getColorRatio('purple') > 0.1,
          isMostlyGray: getColorRatio('gray') > 0.2,
          hasRed: getColorRatio('red') > 0.05,
          hasGreen: getColorRatio('green') > 0.05,
          hasBrown: getColorRatio('brown') > 0.05,
          hasWhite: getColorRatio('white') > 0.05,
          hasYellow: getColorRatio('yellow') > 0.05,
          hasPurple: getColorRatio('purple') > 0.03,
          hasOrange: getColorRatio('orange') > 0.03,
          colorEntropy: topColorEntropy,
          isUniform: uniformQuadrants <= 2,
          isDiverse: uniformQuadrants >= 3,
          colorDiversity: colorProfile.filter(c => c.ratio > 0.05).length,
          backgroundDetected: bgIsLight || bgIsDark,
          backgroundRatio: bgRatio,
          backgroundColors: bgCategories,
        };

        resolve(result);
      };

      img.onerror = function() {
        reject(new Error('图片加载失败'));
      };

      img.src = imageBase64;
    } catch (e) {
      reject(e);
    }
  });
}

// ===================== 颜色特征匹配 =====================

function matchByColorProfile(colorAnalysis) {
  if (!colorAnalysis) return [];

  const scores = herbKnowledgeBase.map(herb => {
    let score = 0;
    const profile = herb.colorProfile;

    const imageColors = {
      red: colorAnalysis.redRatio || 0,
      brown: colorAnalysis.brownRatio || 0,
      yellow: colorAnalysis.yellowRatio || 0,
      green: colorAnalysis.greenRatio || 0,
      white: colorAnalysis.whiteRatio || 0,
      gray: colorAnalysis.grayRatio || 0,
      black: colorAnalysis.blackRatio || 0,
      orange: colorAnalysis.orangeRatio || 0,
      purple: colorAnalysis.purpleRatio || 0,
      blue: colorAnalysis.blueRatio || 0,
    };

    // 主色调匹配
    const dominantSemanticTags = new Set();
    (profile.dominant || []).forEach(colorName => {
      const synonyms = COLOR_SYNONYMS[colorName];
      if (synonyms) synonyms.forEach(tag => dominantSemanticTags.add(tag));
    });

    for (const tag of dominantSemanticTags) {
      const ratio = imageColors[tag] || 0;
      if (ratio > 0.2) score += 30;
      else if (ratio > 0.1) score += 20;
      else if (ratio > 0.05) score += 10;
      else score -= 5;
    }

    // 辅助色调匹配
    const secondarySemanticTags = new Set();
    (profile.secondary || []).forEach(colorName => {
      const synonyms = COLOR_SYNONYMS[colorName];
      if (synonyms) synonyms.forEach(tag => secondarySemanticTags.add(tag));
    });

    for (const tag of secondarySemanticTags) {
      if (dominantSemanticTags.has(tag)) continue;
      const ratio = imageColors[tag] || 0;
      if (ratio > 0.15) score += 15;
      else if (ratio > 0.05) score += 8;
      else if (ratio > 0.02) score += 3;
    }

    // 否定色惩罚
    for (const [color, ratio] of Object.entries(imageColors)) {
      if (ratio > 0.2 && !dominantSemanticTags.has(color) && !secondarySemanticTags.has(color)) {
        score -= 8;
      }
    }

    // 形状提示辅助
    const hint = herb.shapeHint || '';
    if (colorAnalysis.colorDiversity) {
      if (hint.includes('cluster') || hint.includes('multiple') || hint.includes('irregular')) {
        if (colorAnalysis.colorDiversity >= 4) score += 5;
      }
      if (hint.includes('cylindrical') || hint.includes('spherical') || hint.includes('tuber')) {
        if (colorAnalysis.colorDiversity <= 3) score += 3;
      }
    }

    return { herb, score };
  });

  return scores.sort((a, b) => b.score - a.score);
}

// ===================== 主识别函数 =====================

/**
 * 纯前端药材识别
 * @param {string} imageBase64 - base64 编码的图片数据
 * @param {string|null} apiBase - 可选的后端 API 地址，如果可用则优先使用后端
 * @returns {Object} 识别结果
 */
async function identifyHerbFrontend(imageBase64, apiBase = null) {
  const startTime = Date.now();

  // 策略1: 尝试后端API（如果服务器正在运行）
  if (apiBase) {
    try {
      const healthRes = await fetch(apiBase + '/health', { signal: AbortSignal.timeout(2000) });
      if (healthRes.ok) {
        const health = await healthRes.json();
        if (health.cloudAPI) {
          // 后端有云端AI，优先使用
          const res = await fetch(apiBase + '/api/identify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageBase64 })
          });
          if (res.ok) {
            const result = await res.json();
            result._source = 'cloud-api';
            result._duration = Date.now() - startTime;
            return result;
          }
        }
      }
    } catch (e) {
      // 后端不可用，使用前端分析
      console.log('[灵草鉴] 后端不可用，使用前端分析');
    }
  }

  // 策略2: 前端 Canvas 像素级颜色分析 + 知识库匹配
  console.log('[灵草鉴] 使用前端像素级颜色分析+知识库匹配');
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
  let colorAnalysis;
  try {
    colorAnalysis = await analyzeImageColorsCanvas(imageBase64);
  } catch (e) {
    return {
      name: '无法识别',
      confidence: '0.0',
      aiAnalysis: '图片分析失败: ' + e.message,
      _source: 'frontend-color-analysis',
      _duration: Date.now() - startTime
    };
  }

  const colorMatches = matchByColorProfile(colorAnalysis);

  const bestMatch = colorMatches[0];
  if (!bestMatch || !bestMatch.herb) {
    return {
      name: '无法识别',
      confidence: '0.0',
      aiAnalysis: '未能从图片中提取有效的颜色特征信息。',
      _source: 'frontend-color-analysis',
      _duration: Date.now() - startTime
    };
  }

  const herb = bestMatch.herb;
  const matchScore = bestMatch.score;
  const secondScore = colorMatches[1] ? colorMatches[1].score : 0;
  const scoreGap = matchScore - secondScore;

  let confidence;
  if (matchScore <= 0) {
    confidence = 15;
  } else if (scoreGap > 30 && matchScore > 50) {
    confidence = Math.min(72, Math.round(matchScore * 0.7 + 15));
  } else if (scoreGap > 15 && matchScore > 30) {
    confidence = Math.min(60, Math.round(matchScore * 0.6 + 10));
  } else {
    confidence = Math.min(50, Math.round(matchScore * 0.5 + 8));
  }

  // 构建颜色分析描述
  let colorDesc = '';
  if (colorAnalysis) {
    const topColors = colorAnalysis.dominantColors.slice(0, 5).map(c => {
      const name = COLOR_NAMES_CN[c.color] || c.color;
      return `${name}(${(c.ratio * 100).toFixed(1)}%)`;
    });
    colorDesc = `图片主要颜色分布: ${topColors.join(', ')}。`;
    if (colorAnalysis.width) colorDesc += `尺寸: ${colorAnalysis.width}x${colorAnalysis.height}，`;
    colorDesc += `分析像素: ${colorAnalysis.width * colorAnalysis.height}。`;
  }

  const candidates = colorMatches.slice(0, 3)
    .filter(m => m.score > 0)
    .map(m => `${m.herb.name}(${m.score}分)`)
    .join(' > ');

  const result = {
    ...herb,
    confidence: confidence.toFixed(1),
    aiAnalysis: colorDesc +
      `【前端像素级颜色特征分析+知识库匹配模式】` +
      `候选排名: ${candidates}。` +
      '本模式通过浏览器Canvas API分析图片颜色分布特征来辅助判断药材种类。' +
      '如需获得更高的AI精准识别，可在本地运行 server.js 并配置云端AI API密钥。',
    _source: 'frontend-color-analysis',
    _duration: Date.now() - startTime
  };

  // 清除内部字段
  delete result.colorProfile;
  delete result.shapeHint;
  delete result.keywords;

  return result;
}

// 导出（兼容模块和非模块环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { herbKnowledgeBase, identifyHerbFrontend, analyzeImageColorsCanvas, classifyPixel, matchByColorProfile };
}
