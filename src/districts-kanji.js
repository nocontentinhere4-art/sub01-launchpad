// Station-sign names for the 48 district ids of city-state.js: the kanji (or kana) on the plate and a 3-letter line
// code for the station board's band. '' is the whole city. Decorative: the romaji name is always shown next to it.
export const KANJI={'':['東京','TYO'],
 shiba:['芝','SHB'],shinjuku:['新宿','SJK'],akihabara:['秋葉原','AKB'],shibuya:['渋谷','SBY'],harajuku:['原宿','HRJ'],nakameguro:['中目黒','NKM'],
 ebisu:['恵比寿','EBS'],roppongi:['六本木','RPG'],ginza:['銀座','GNZ'],asakusa:['浅草','ASK'],ueno:['上野','UEN'],ikebukuro:['池袋','IKB'],
 nakano:['中野','NKN'],kanda:['神田','KND'],tsukiji:['築地','TKJ'],odaiba:['お台場','ODB'],yoyogi:['代々木','YYG'],meguro:['目黒','MGR'],
 shinagawa:['品川','SGW'],sumida:['墨田','SMD'],daikanyama:['代官山','DKY'],nihonbashi:['日本橋','NHB'],koenji:['高円寺','KOJ'],
 shimokitazawa:['下北沢','SMK'],kiyosumi:['清澄','KYS'],ryogoku:['両国','RGK'],oshiage:['押上','OSG'],yanaka:['谷中','YNK'],sugamo:['巣鴨','SGM'],
 takadanobaba:['高田馬場','TDB'],ogikubo:['荻窪','OGK'],kinshicho:['錦糸町','KSC'],kichijoji:['吉祥寺','KCJ'],ochanomizu:['御茶ノ水','OCN'],
 kagurazaka:['神楽坂','KGZ'],toyosu:['豊洲','TYS'],omotesando:['表参道','OMS'],gotanda:['五反田','GTD'],jiyugaoka:['自由が丘','JYG'],
 tsukishima:['月島','TSM'],sangenjaya:['三軒茶屋','SGJ'],kitasenju:['北千住','KSJ'],nippori:['日暮里','NPR'],aoyama:['青山','AOY'],
 shinbashi:['新橋','SNB'],akasaka:['赤坂','AKS'],iidabashi:['飯田橋','IDB'],mejiro:['目白','MJR']};
export const kanjiOf=id=>KANJI[id??'']?.[0]||'';
export const codeOf=id=>KANJI[id??'']?.[1]||String(id||'').slice(0,3).toUpperCase();
// A plot id ('sugamo-6') as a station address ('SGM-06'); '' for anything that is not a plot.
export const addressCode=plotId=>{const m=/^([a-z]+)-(\d+)$/.exec(plotId||'');return m&&KANJI[m[1]]?`${codeOf(m[1])}-${m[2].padStart(2,'0')}`:'';};
