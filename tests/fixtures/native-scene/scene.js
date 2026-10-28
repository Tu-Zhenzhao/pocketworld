import {MeshBuilder} from '../../engine/mesh.js';
export default {
 config:{id:'alpha-fixture',title:'Alpha fixture',grid:48,loop:2,fps:60,camera:{azimuth:45,elevation:30,span:2.5,target:[0,0,0]},light:[-1,1,1],palette:[[255,255,255],[200,60,30]],materials:[{colors:[0]},{colors:[1]}]},
 state(t,options={}){return{time:(t%2+2)%2,x:options.still?0:Math.sin(t*Math.PI)*.2}},
 geometry(s){const m=new MeshBuilder();m.ellipsoid([-.42,0,0],[.28,.35,.26],0);m.ellipsoid([.42+s.x,.12,0],[.22,.22,.22],1);return m.finish()}
};
