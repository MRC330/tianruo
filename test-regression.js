const B='http://127.0.0.1:3000';const A=process.env.ADMIN_TOKEN || 'tianruo-admin-2024';
let pass=0,fail=0;const fails=[];
async function req(m,p,b,t){const r=await fetch(B+p,{method:m,headers:Object.assign({'Content-Type':'application/json'},t?{Authorization:'Bearer '+t}:{}),body:b?JSON.stringify(b):null});try{return await r.json()}catch(e){return{ok:false,msg:'HTTP '+r.status}}}
function adm(p){return fetch(B+p,{headers:{'x-admin-token':A}}).then(x=>x.json())}
function ok(n,c,e){if(c)pass++;else{fail++;fails.push(n+(e?' :: '+JSON.stringify(e).slice(0,110):''))}}
(async()=>{
 let r=await req('POST','/api/auth/login',{phone:'13800000000',password:'123456'});ok('1.密码登录',r.ok&&r.token,r);const T=r.token;
 const sc=await req('POST','/api/auth/send-code',{phone:'13522223333'});ok('2.发验证码',sc.ok,sc);
 r=await req('POST','/api/auth/login',{phone:'13522223333',code:sc.devCode});ok('3.验证码登录',r.ok&&r.token,r);
 r=await req('GET','/api/auth/me',null,T);ok('4.获取本人',r.ok&&r.user,r);
 r=await req('GET','/api/auth/me',null,'bad');ok('5.无效token拦截',!r.ok,r);
 r=await req('GET','/api/extra/recommend?limit=6',null,T);ok('6.智能推荐',r.ok&&r.list.length>0,{n:r.list&&r.list.length});
 const rec=r.list&&r.list[0];ok('7.推荐含打分',rec&&rec.matchScore!=null,rec&&{k:Object.keys(rec).slice(0,8)});
 r=await req('GET','/api/extra/why/'+(rec&&rec.id),null,T);ok('8.为什么推荐TA',r.ok,r);
 const cards=await req('GET','/api/match/cards',null,T);ok('9.基础卡片',cards.ok&&cards.list.length>0,{n:cards.list&&cards.list.length});
 r=await req('GET','/api/match/quota',null,T);ok('10.今日额度',r.ok&&r.quota,r);
 r=await req('POST','/api/match/swipe',{toId:cards.list[0].id,type:'like'},T);ok('11.滑动like',r.ok,r);
 r=await req('GET','/api/user/likes-me',null,T);ok('12.谁喜欢我',r.ok,r);
 r=await req('GET','/api/chat/list',null,T);ok('13.会话列表',r.ok&&r.list.length>0,{n:r.list&&r.list.length});
 const mid=r.list[0].matchId,peer=r.list[0].user.id;
 let s=await req('POST','/api/chat/'+mid+'/send',{content:'回归测试-你好',type:'text'},T);ok('14.发文字',s.ok,s);
 s=await req('GET','/api/chat/'+mid,null,T);ok('15.聊天记录',s.ok&&s.list.length>0,{n:s.list&&s.list.length});
 s=await req('POST','/api/chat/'+mid+'/send',{content:'[语音]',type:'voice'},T);ok('16.发语音',s.ok,s);
 s=await req('POST','/api/chat/'+mid+'/read',null,T);ok('17.标记已读',s.ok,s);
 s=await req('POST','/api/chat/'+mid+'/typing',null,T);ok('18.输入中',s.ok,s);
 s=await req('GET','/api/chat/'+mid+'/search?kw=回归',null,T);ok('19.消息搜索',s.ok,s);
 s=await req('POST','/api/chat/'+mid+'/settings',{top:true,note:'备注'},T);ok('20.会话设置',s.ok,s);
 s=await req('GET','/api/chat/stickers',null,T);ok('21.表情包',s.ok&&s.list.length>0,{n:s.list&&s.list.length});
 s=await req('GET','/api/game/tianruo',null,T);ok('22.火花值总览',s.ok,s);
 s=await req('GET','/api/game/tianruo/'+mid,null,T);ok('23.单会话火花',s.ok,s);
 s=await req('GET','/api/game/tasks',null,T);ok('24.每日任务',s.ok&&s.list.length>0,{n:s.list&&s.list.length});
 s=await req('GET','/api/game/checkin',null,T);ok('25.签到状态',s.ok,s);
 s=await req('GET','/api/game/questions',null,T);ok('26.心动问答',s.ok&&s.list.length>0,{n:s.list&&s.list.length});
 s=await req('GET','/api/game/compat/'+peer,null,T);ok('27.契合度',s.ok,s);
 s=await req('POST','/api/game/flash/enter',{},T);ok('28.进入闪聊',s.ok,s);
 let room=null;
 if(s.ok&&s.roomId){room=s.roomId;s=await req('POST','/api/game/flash/'+room+'/send',{content:'闪聊'},T);ok('29.闪聊发言',s.ok,s);
   await req('POST','/api/game/flash/'+room+'/leave',{},T);}else ok('29.闪聊发言',false,s);
 r=await req('GET','/api/group/circles',null,T);ok('31.圈子列表',r.ok&&r.list.length>0,{n:r.list&&r.list.length});
 s=await req('GET','/api/group/hot',null,T);ok('32.热榜',s.ok,s);
 s=await req('GET','/api/group/rank',null,T);ok('33.活跃榜',s.ok,s);
 s=await req('GET','/api/moment/feed',null,T);ok('34.动态流',s.ok&&s.list.length>0,{n:s.list&&s.list.length});
 const pm=await req('POST','/api/moment/publish',{text:'最终版回归测试动态',images:[],topic:''},T);ok('35.发动态',pm.ok,pm);
 if(pm.ok){const cid=pm.moment.id;
   let c=await req('POST','/api/moment/'+cid+'/comment',{text:'一级评论'},T);ok('36.一级评论',c.ok,c);
   if(c.ok&&c.comment){const rp=await req('POST','/api/group/moment/'+cid+'/reply',{commentId:c.comment.id,text:'楼中楼'},T);ok('37.楼中楼',rp.ok,rp);}else ok('37.楼中楼',false,c);
   c=await req('POST','/api/moment/'+cid+'/like',{},T);ok('38.动态点赞',c.ok,c);
   await req('DELETE','/api/moment/'+cid,null,T);}
 r=await req('GET','/api/extra/vip/plans',null,T);ok('39.VIP套餐',r.ok&&r.list.length>0,{n:r.list&&r.list.length});
 r=await req('GET','/api/extra/gifts',null,T);ok('40.礼物列表',r.ok&&r.list.length>0,{n:r.list&&r.list.length});
 r=await req('POST','/api/extra/coins/recharge',{amount:300},T);ok('41.充值',r.ok,r);
 r=await req('POST','/api/extra/gift/send',{matchId:mid,giftId:'g1'},T);ok('42.送礼物',r.ok,r);
 r=await req('GET','/api/extra/invite',null,T);ok('43.邀请码',r.ok,r);
 r=await req('GET','/api/user/profile/'+peer,null,T);ok('44.他人资料',r.ok&&r.user,r);
 r=await req('GET','/api/user/nearby?limit=5',null,T);ok('45.附近的人',r.ok,r);
 r=await req('GET','/api/user/search?kw=小',null,T);ok('46.搜索',r.ok,r);
 r=await req('GET','/api/user/visitors',null,T);ok('47.访客',r.ok,r);
 r=await req('POST','/api/user/report',{userId:peer,reason:'测试举报'},T);ok('48.举报',r.ok,r);
 r=await req('GET','/api/social/notifications',null,T);ok('49.通知列表',r.ok,r);
 r=await req('GET','/api/social/badge',null,T);ok('50.红点',r.ok,r);
 r=await req('GET','/api/social/hellos',null,T);ok('51.打招呼',r.ok&&r.list.length>0,{n:r.list&&r.list.length});
 r=await req('POST','/api/moment/publish',{text:'你这个傻逼',images:[]},T);ok('52.敏感词拦截',!r.ok,r);
 r=await req('POST','/api/chat/'+mid+'/send',{content:'约炮吗',type:'text'},T);ok('53.聊天敏感词拦截',!r.ok,r);
 r=await req('POST','/api/moment/publish',{text:'正常内容测试',images:[]},T);ok('54.正常内容放行',r.ok,r);
 if(r.ok)await req('DELETE','/api/moment/'+r.moment.id,null,T);
 r=await adm('/api/admin/dashboard');ok('55.后台看板',r.ok,r&&Object.keys(r).slice(0,5));
 r=await adm('/api/admin/users?limit=5');ok('56.后台用户',r.ok,r&&Object.keys(r).slice(0,4));
 r=await adm('/api/admin/moments');ok('57.后台动态',r.ok,r);
 r=await adm('/api/admin/reports');ok('58.后台举报',r.ok,r);
 r=await fetch(B+'/api/admin/dashboard',{headers:{'x-admin-token':'x'}}).then(x=>x.json());ok('59.后台鉴权',!r.ok,r);
 r=await fetch(B+'/api/admin/broadcast',{method:'POST',headers:{'x-admin-token':A,'Content-Type':'application/json'},body:JSON.stringify({text:'测试广播'})}).then(x=>x.json());ok('60.系统广播',r.ok,r);
 for(const p of ['/','/admin.html','/manifest.json','/sw.js','/css/app.css','/js/app.js','/js/pages4.js','/avatar/test']){
   const res=await fetch(B+p);ok('静态 '+p,res.status===200,{s:res.status});}
 console.log(`\n✅ 通过 ${pass}  ❌ 失败 ${fail}`);
 if(fails.length)console.log('\n失败项:\n - '+fails.join('\n - '));
})();
