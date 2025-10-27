// server.js — API + serwowanie index.html/assetów z katalogu głównego (bez folderu public)// server.js — API + statyki z katalogu głównego
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Serwuj pliki (index.html, sw.js, manifest.json, favicon.png) z katalogu głównego
app.use(express.static(__dirname, { extensions: ['html'], maxAge: '1h' }));

/* ==== DB: Mongo (opcjonalnie) ==== */
let useMongo = false; let Models = {};
(async () => {
  if (process.env.MONGODB_URI) {
    try {
      const mongoose = require('mongoose');
      await mongoose.connect(process.env.MONGODB_URI);
      useMongo = true;

      const userSchema    = new mongoose.Schema({ login:String, password:String, role:{type:String,default:'employee'}, fullname:String, profile:Object, profileDone:{type:Boolean, default:false} }, { timestamps:true });
      const orderSchema   = new mongoose.Schema({ title:String, client:String, what:String, due:String, amount:Number, contact:String, done:{type:Boolean,default:false} }, { timestamps:true });
      const financeSchema = new mongoose.Schema({ type:String, amount:Number, note:String }, { timestamps:true });
      const projectSchema = new mongoose.Schema({ name:String, logo:String, notes:[String] }, { timestamps:true });
      const taskSchema    = new mongoose.Schema({ title:String, desc:String, due:String, assignedTo:String, done:{type:Boolean,default:false} }, { timestamps:true });
      const earningSchema = new mongoose.Schema({ user:String, amount:Number, note:String }, { timestamps:true });

      Models = {
        User:    mongoose.model('User', userSchema),
        Order:   mongoose.model('Order', orderSchema),
        Finance: mongoose.model('Finance', financeSchema),
        Project: mongoose.model('Project', projectSchema),
        Task:    mongoose.model('Task', taskSchema),
        Earning: mongoose.model('Earning', earningSchema),
      };

      const cnt = await Models.User.countDocuments();
      if (cnt === 0) await Models.User.create({ login:'Gracjan', password:'Gracjan33201', role:'admin', fullname:'Administrator' });

      console.log('MongoDB connected');
    } catch (e) {
      console.warn('Mongo disabled:', e.message);
    }
  }
})();

// Memory fallback
const mem = {
  users:[{ login:'Gracjan', password:'Gracjan33201', role:'admin', fullname:'Administrator' }],
  orders:[], finance:[], projects:[], tasks:[], earnings:[]
};

// helpers
const ok=(res,data)=>res.json({ok:true,data});
const bad=(res,msg)=>res.status(400).json({ok:false,error:msg});

/* ==== API ==== */
// Auth
app.post('/api/login', async (req,res)=>{
  const {login,password}=req.body||{};
  if(useMongo){
    const u = await Models.User.findOne({login,password});
    if(!u) return bad(res,'invalid');
    return ok(res,{login:u.login, role:u.role});
  } else {
    const u = mem.users.find(x=>x.login===login && x.password===password);
    if(!u) return bad(res,'invalid');
    return ok(res,{login:u.login, role:u.role});
  }
});

// Users (add/list) + profile
app.post('/api/users', async (req,res)=>{
  const {login,password,fullname}=req.body||{}; if(!login||!password) return bad(res,'missing');
  if(useMongo){ const u=await Models.User.create({login,password,fullname,role:'employee'}); return ok(res,u); }
  mem.users.push({login,password,fullname,role:'employee'}); ok(res,true);
});
app.get('/api/users', async (req,res)=> useMongo ? ok(res, await Models.User.find()) : ok(res, mem.users));
app.post('/api/users/:login/profile', async (req,res)=>{
  const data=req.body||{};
  if(useMongo){
    const u=await Models.User.findOne({login:req.params.login}); if(!u) return bad(res,'not found');
    u.profile=data; u.profileDone=true; if(data.fullname) u.fullname=data.fullname; await u.save(); return ok(res,u);
  }
  const u=mem.users.find(x=>x.login===req.params.login); if(!u) return bad(res,'not found');
  u.profile=data; u.profileDone=true; if(data.fullname) u.fullname=data.fullname; ok(res,u);
});

// Orders
app.post('/api/orders', async (req,res)=>{
  const o=req.body||{}; if(!o.title) return bad(res,'missing title');
  if(useMongo){ return ok(res, await Models.Order.create(o)); }
  o.id='o_'+Date.now(); mem.orders.unshift(o); ok(res,o);
});
app.get('/api/orders', async (req,res)=> useMongo ? ok(res, await Models.Order.find().sort({createdAt:-1})) : ok(res, mem.orders));
app.post('/api/orders/:id/toggle', async (req,res)=>{
  const id=req.params.id;
  if(useMongo){
    const o=await Models.Order.findById(id); if(!o) return bad(res,'not found');
    o.done=!o.done; await o.save(); return ok(res,o);
  }
  const o=mem.orders.find(x=>x.id===id); if(!o) return bad(res,'not found');
  o.done=!o.done; ok(res,o);
});

// Tasks
app.post('/api/tasks', async (req,res)=>{
  const t=req.body||{}; if(!t.title||!t.assignedTo) return bad(res,'missing');
  if(useMongo) return ok(res, await Models.Task.create(t));
  t.id='t_'+Date.now(); mem.tasks.unshift(t); ok(res,t);
});
app.get('/api/tasks', async (req,res)=>{
  const {user}=req.query||{};
  if(useMongo){
    const q=user?{assignedTo:user}:{};
    return ok(res, await Models.Task.find(q).sort({createdAt:-1}));
  }
  const list = user? mem.tasks.filter(t=>t.assignedTo===user) : mem.tasks;
  ok(res, list);
});
app.post('/api/tasks/:id/toggle', async (req,res)=>{
  const id=req.params.id;
  if(useMongo){
    const t=await Models.Task.findById(id); if(!t) return bad(res,'not found');
    t.done=!t.done; await t.save(); return ok(res,t);
  }
  const t=mem.tasks.find(x=>x.id===id); if(!t) return bad(res,'not found');
  t.done=!t.done; ok(res,t);
});

// Earnings
app.post('/api/earnings', async (req,res)=>{
  const {user,amount,note}=req.body||{}; if(!user||isNaN(parseFloat(amount))) return bad(res,'missing');
  if(useMongo) return ok(res, await Models.Earning.create({user,amount,note}));
  mem.earnings.unshift({id:'e_'+Date.now(),user,amount:parseFloat(amount),note}); ok(res,true);
});
app.get('/api/earnings', async (req,res)=>{
  const {user}=req.query||{};
  if(useMongo){
    const q=user?{user}:{};
    const list=await Models.Earning.find(q).sort({createdAt:-1});
    const sum=list.reduce((a,b)=>a+(b.amount||0),0);
    return ok(res,{sum, list});
  }
  const list=(user? mem.earnings.filter(e=>e.user===user) : mem.earnings);
  const sum=list.reduce((a,b)=>a+(b.amount||0),0);
  ok(res,{sum, list});
});

// SPA fallback
app.get('*', (req,res,next)=> req.path.startsWith('/api') ? next() : res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT, ()=> console.log('API on :' + PORT));


