
var symbols = "0123456789abcdefghijklmnopqrstuvwxyz"; 
var endbases = [2,8,10,16]; 
var output =[...Array(8)];
var tableEnum = ["bin" , "oct" ,"dec","hex", ]
function run(){
    
    var inp = document.getElementById("input_num");
    var baseinp = document.getElementById("base_input");  
    // var contdiv = document.getElementById("content_div"); 
    // contdiv.innerHTML = ""; 
    if( inp.value != "" && baseinp.value!=""){
        var numtoconv = inp.value , ntcindec ;  
        var inputval = inp.value ;    
        var inpbase = baseinp.value ; 
        
        if(inpbase == "ASCII" )inpbase = 2; 
        
        if( inpbase == "CHAR" ){
            numtoconv = numtoconv.charCodeAt(0); 
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
        
        }
        
        fillNumericals( endbases , inpbase , inputval,ntcindec) ; 
        // CHAR
        output[5] =  String.fromCharCode(ntcindec)  ; 
        //BCD
        output[6] = constructBCD( ntcindec+"" ); 
        // GREY
        output[7] = dectogrey(ntcindec); 
        DisplayRes(); 

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
    lim = Math.min(i + 3,s.length-1); 
    for(var j = i ; j <= lim ; j++ ){
        quad += s[j]; 
    }
    res += parseInt( quad , 2 ); 
    i = lim + 1; 
}
return res ; 

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

function fillNumericals(endbases , inpbase , inputval,ntcindec){
    for(var i=0 ; i < endbases.length ; i++ ){
        
           
            output[i] = ConvertBases( ntcindec , endbases[i]) ; 
            if(endbases[i]==2)
            
            output[4] = ConvertBases( ntcindec , endbases[i]); 
        
    }
}

function DisplayRes(){
    var table = document.getElementById("dataTable"); 
    var tr = document.createElement("tr"); 
    
    for(var i = 0 ; i < output.length ; i++  ){
        var td = document.createElement("td");
        td.innerText = output[i]; 
        tr.appendChild(td);      
    }
    table.appendChild(tr); 
}