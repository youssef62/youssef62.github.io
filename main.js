
function run(){
    var inp = document.getElementById("input_num");
    var baseinp = document.getElementById("base_input");  
    if( inp.value != "" && baseinp.value!=""){
        var numtoconv = inp.value , ntcindec ;  
        var inputval = inp.value ;    
        var inpbase = baseinp.value ; 
        console.log("ok");
        if(inpbase == "ASCII" )inpbase = 2; 
        if( inpbase == "CHAR" ){
            numtoconv = numtoconv.charCodeAt(0); 
            shownum( inputval , " ASCII " , ConvertBases(numtoconv,2) ) ; 
            ntcindec = parseInt(numtoconv , inpbase); 
        }
        else if(inpbase=="GREY"){
            ntcindec = greytodec(numtoconv); 
        }
        else {
            ntcindec = parseInt(numtoconv , inpbase);
            shownum( inputval , " CHAR " , String.fromCharCode(ntcindec) ) ; 
        }
        var endbases = [2,8,10,16]; 
        //var ntcindec = parseInt(numtoconv , inpbase); 
        for(var i=0 ; i < endbases.length ; i++ ){
            if( parseInt(inpbase) != endbases[i] )
            {
               shownum( inputval , endbases[i] , ConvertBases( ntcindec , endbases[i])) ; 
                if(endbases[i]==2)
                shownum ( inputval ,  " ASCII " , ConvertBases( ntcindec , endbases[i])); 
            }
        }
        
        
        shownum ( inputval , " in bcd " , constructBCD( ntcindec+"" )); 

        shownum ( inputval , " in grey " , dectogrey(ntcindec)); 
        

    }
}

function constructBCD( s ){
    var i = s.length -1;
    var res  = "";
    
    
    for( ; i>=0  ; i-- ){
        
        var cb = ConvertBases( parseInt(s[i]) , 2 );
        for(var k = cb.length ; k < 4 ; k++ ){
            cb  = "0" + cb; 
        }
        console.log("cb is "+ cb);
        
        res =  cb + res ; 
        
    }
return res; 
}
function shownum ( s , b , res ){
    var el = document.createElement("h2"); 
    document.body.appendChild(el);
    el.innerText = s + " in " + b + " is " + res; 
    
}
var symbols = "0123456789abcdefghijklmnopqrstuvwxyz"; 
function ConvertBases ( a , b ){
    var res = "" ; 
    while( a != 0){
        res = symbols[ a % b ] + res ;
        a = Math.floor( a / b ); 
    }
    return res; 
}



function dectogrey(text){
    //text = text.replace(/\r\n/g, '\n');
            //var lines = text.split('\n');
            var ret = "";

                    var num = parseInt(text, 10);
                    var gray = (num ^ (num >> 1)).toString(2);
                    while (gray.length < 8) {
                        gray = "0" + gray;
                    }
                    ret = gray;
                
                
            return ret;
 
}

function greytodec(text){
    
            var num = parseInt(text, 2);
            for (var mask = num >> 1; mask != 0; mask = mask >> 1) {
                num = num ^ mask;
            }
            ret += num.toString();
    return ret;
}