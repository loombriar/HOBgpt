const {isIP,BlockList}=require('node:net');
const privateAddresses=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['224.0.0.0',4],['240.0.0.0',4]])privateAddresses.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]])privateAddresses.addSubnet(address,prefix,'ipv6');
function trafficLocation(req,{railway=Boolean(process.env.RAILWAY_PROJECT_ID),lookup}={}){
 // Railway's edge supplies X-Real-IP. Ignore client headers on other hosts.
 let ip=String((railway?req.get('x-real-ip'):null)||req.socket?.remoteAddress||'');
 if(ip.startsWith('::ffff:'))ip=ip.slice(7);
 const family=isIP(ip);if(!family||privateAddresses.check(ip,family===4?'ipv4':'ipv6'))return {};
 try{
  const result=(lookup||require('geoip-lite').lookup)(ip);if(!result)return {};
  const clean=value=>typeof value==='string'?value.trim().slice(0,100)||null:null;
  // Discard the address, coordinates, postal code and all other lookup details.
  return {country:clean(result.country),region:clean(result.region),city:clean(result.city)};
 }catch{return {};}
}
module.exports={trafficLocation};
