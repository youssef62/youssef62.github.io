
var symbols = "0123456789abcdefghijklmnopqrstuvwxyz"; 
var endbases = [2,8,10,16]; 
var output =[...Array(20)];

function run(){
    
    var inp = document.getElementById("input_num");
    var baseinp = document.getElementById("base_input");  
    var contdiv = document.getElementById("content_div"); 
    contdiv.innerHTML = ""; 
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
        else if( inpbase =="BCD"){
            ntcindec = parseInt( BCDtoDec( numtoconv ) ); 
        }
        else {
            ntcindec = parseInt(numtoconv , inpbase);
            shownum( inputval , " CHAR " , String.fromCharCode(ntcindec) ) ; 
        }//var ntcindec = parseInt(numtoconv , inpbase); 
        for(var i=0 ; i < endbases.length ; i++ ){
            if( parseInt(inpbase) != endbases[i] )
            {
               shownum( inputval , endbases[i] , ConvertBases( ntcindec , endbases[i])) ; 
                if(endbases[i]==2)
                shownum ( inputval ,  " ASCII " , ConvertBases( ntcindec , endbases[i])); 
            }
        }
        
        
        shownum( inputval , " CHAR " , String.fromCharCode(ntcindec) ) ; 
        shownum ( inputval , " in bcd " , output[5] = constructBCD( ntcindec+"" )); 

        shownum ( inputval , " in grey " , output[6] = dectogrey(ntcindec)); 
        

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

function BCDtoDec( s ){
    var i = 0 , lim ;
    var res ="" , quad = "";  
    while( i < s.length ) {
    quad =""; 
    lim = min(i + 3,s.length-1); 
    for(var j = i ; j <= lim ; j++ ){
        quad += s[j]; 
    }
    res += parseInt( quand , 2 ); 
    i = lim + 1; 
}

}
function shownum ( s , b , res ){
    var el = document.createElement("h2"); 
    document.getElementById("content_div").appendChild(el);
    el.innerText = s + " in " + b + " is " + res; 
    
}


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
            var ret ="" ; 
            for (var mask = num >> 1; mask != 0; mask = mask >> 1) {
                num = num ^ mask;
            }
            ret += num.toString();
    return ret;
}

function fillNumericals(endbases , inpbase){
    for(var i=0 ; i < endbases.length ; i++ ){
        if( parseInt(inpbase) != endbases[i] )
        {
           
            shownum( inputval , endbases[i] ,output[i] = ConvertBases( ntcindec , endbases[i])) ; 
            if(endbases[i]==2)
            shownum ( inputval ,  " ASCII " , output[4] = ConvertBases( ntcindec , endbases[i])); 
        }
    }
}