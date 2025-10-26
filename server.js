// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// --- DB: try mongoose, else memory ---
let useMongo = false; let Models = {};
(async () => {
  if(process.env.MONGODB_URI){
    try{
      const mongoose = require('mongoose');
      await mongoose.connect(process.env.MONGODB_URI);
      useMongo = true;
      const userSchema = new mongoose.Schema({ login:String, password:String, role:{type:String,default:'employee'} }, { timestamps:true });
      const orderSchema = new mongoose.Schema({ title:String, client:String, what:String, due:String, amount:Number, contact:String, done:{type:Boolean,default:false} }, { timestamps:true });
      const financeSchema = new mongoose.Schema({ type:String, amount:Number, note:String }, { timestamps:true });
      const projectSchema = new mongoose.Schema({ name:String, logo:String, notes:[String] }, { timestamps:true });
      Models = {
        User: mongoose.model('User', userSchema),
        Order: mongoose.model('Order', orderSchema),
        Finance: mongoose.model('Finance', financeSchema),
        Project: mongoose.model('Project', projectSchema),
      };
      // seed admin
      const cnt = await Models.User.countDocuments();
      if(cnt===0){ await Models.User.create({ login:'Gracjan', password:'Gracjan33201', role:'admin' }); }
      console.log('MongoDB connected');
    }catch(e){ console.warn('Mongo disabled:', e.message); }
  }
})();

// Memory fallback
const mem = {
  users:[{login:'Gracjan', password:'Gracjan33201', role:'admin'}],
  orders:[], finance:[], projects:[]
};

// helpers
function ok(res,data){res.json({ok:true,data});}
function bad(res,msg){res.status(400).json({ok:false,error:msg});}

// Auth (simple)
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

// Users (employees)
app.post('/api/users', async (req,res)=>{
  const {login,password}=req.body||{}; if(!login||!password) return bad(res,'missing');
  if(useMongo){ const u = await Models.User.create({login,password,role:'employee'}); return ok(res,u); }
  mem.users.push({login,password,role:'employee'}); ok(res,true);
});
app.get('/api/users', async (req,res)=>{
  if(useMongo){ return ok(res, await Models.User.find()); }
  ok(res, mem.users);
});

// Orders
app.post('/api/orders', async (req,res)=>{
  const o = req.body||{}; if(!o.title) return bad(res,'missing title');
  if(useMongo){ const row = await Models.Order.create(o); return ok(res,row); }
  o.id = 'o_'+Date.now(); mem.orders.unshift(o); ok(res,o);
});
app.get('/api/orders', async (req,res)=>{
  if(useMongo){ return ok(res, await Models.Order.find().sort({createdAt:-1})); }
  ok(res, mem.orders);
});
app.post('/api/orders/:id/toggle', async (req,res)=>{
  const id = req.params.id;
  if(useMongo){
    const o = await Models.Order.findById(id); if(!o) return bad(res,'not found');
    o.done = !o.done; await o.save();
    if(o.done){ await Models.Finance.create({ type:'income', amount:o.amount||0, note:`Zlecenie: ${o.title}` }); }
    return ok(res,o);
  } else {
    const o = mem.orders.find(x=>x.id===id); if(!o) return bad(res,'not found');
    o.done = !o.done; if(o.done){ mem.finance.unshift({type:'income', amount:o.amount||0, note:`Zlecenie: ${o.title}`}); }
    ok(res,o);
  }
});

// Finance
app.get('/api/finance', async (req,res)=>{
  if(useMongo){
    const list = await Models.Finance.find().sort({createdAt:-1});
    const sum = list.reduce((a,b)=>a+(b.amount||0),0);
    return ok(res,{sum, history:list});
  }
  const sum = mem.finance.reduce((a,b)=>a+(b.amount||0),0);
  ok(res,{sum, history:mem.finance});
});
app.post('/api/finance', async (req,res)=>{
  const {amount, note} = req.body||{}; if(isNaN(parseFloat(amount))) return bad(res,'amount');
  if(useMongo){ const row = await Models.Finance.create({type:'income', amount, note:note||'Manual'}); return ok(res,row); }
  mem.finance.unshift({type:'income', amount:parseFloat(amount), note:note||'Manual'}); ok(res,true);
});

// Projects
app.post('/api/projects', async (req,res)=>{
  const p = req.body||{}; if(!p.name) return bad(res,'name');
  if(useMongo){ const row = await Models.Project.create(p); return ok(res,row); }
  p.id='p_'+Date.now(); p.notes=p.notes||[]; mem.projects.unshift(p); ok(res,p);
});
app.get('/api/projects', async (req,res)=>{
  if(useMongo){ return ok(res, await Models.Project.find().sort({createdAt:-1})); }
  ok(res, mem.projects);
});
app.post('/api/projects/:id/notes', async (req,res)=>{
  const {text}=req.body||{}; if(!text) return bad(res,'text');
  if(useMongo){
    const p = await Models.Project.findById(req.params.id); if(!p) return bad(res,'not found');
    p.notes.unshift(text); await p.save(); return ok(res,p);
  }
  const p = mem.projects.find(x=>x.id===req.params.id); if(!p) return bad(res,'not found');
  p.notes.unshift(text); ok(res,p);
});

app.get('/', (req,res)=> res.send('Manager 1.0 API OK'));

app.listen(PORT, ()=> console.log('API on :' + PORT));
