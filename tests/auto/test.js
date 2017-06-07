$(document).ready(function(){
    var getKeys = function(obj){
       var keys = [];
       for(var key in obj){
          keys.push(key);
       }
       return keys;
    }

    var canvasCount= function(){

        return $('#gldiv').children().length;
    }

    /**
    Tests for global vairiables 
    */
    var GlobalTester = (function(){
        var fields={}
        var before = function(w){
            for(var field in w){
                fields[field] = true;
            }
            return fields;
        }

        var after = function(w){
            var errors=[];
            for(var field in w){
                if(!fields[field]){
                    delete window[field];
                    errors.push(field);
                }            
            }
            return errors;

        }
        return {before: before, after:after};
    }());

    function waitfor(test, expectedValue, msec, count, source, callback) {
        // Check if condition met. If not, re-check later (msec).
        if (test() !== expectedValue) {
            count++;
            setTimeout(function() {
                waitfor(test, expectedValue, msec, count, source, callback);
            }, msec);
            return;
        }
        // Condition finally met. callback() can be executed.
        callback();
    }

    function createRow(key){

        var tr = $('<tr class="examplerow">').prop('id',key+"_row");
        $('<td class="label">').appendTo(tr).append('<p>'+key+'</p>');
        $('<td class="rendered">').appendTo(tr);
        $('<td class="reference">').appendTo(tr).append('<img src="imgs/'+key+'.png">');
        $('<td class="difference">').appendTo(tr);
        $('#tests_table').append(tr);
        return tr;
    }

    $('#sorttable').click(function() {
        //sort the table with the worse examples first
        //detach rows from tbody
        var rows = $('#tests_table tr').detach().get();
        //sort
        rows.sort(function(a, b) {

            var A = $(a).find('.percentage').html();
            var B = $(b).find('.percentage').html();
            A = parseFloat(A);
            B = parseFloat(B);
            if(isNaN(A)) A = 10000; //error messages go to front
            if(isNaN(B)) B = 10000;
            return B-A; //large to small

        });

        //reattach
        $('#tests_table').append(rows);
       
    });
    
    var keys=getKeys(system)
    keys.sort(); //lexographic ordering

    var par=$('<p>   0/'+keys.length+'</p>').css('display','inline');
    $("#summary_list").append(par);

    var beforeGlobals;
    var i=0;
    $('#gldiv').hide();

    // apparently toDataURL isn't technically a standard for webgl canvases
    // and (some versions of) safari return the image flipped vertically
    // this returns an image uri in a (hopefully) portable way
    function imageFromWebGlCanvas(canvas) {
        var w = canvas.width;
        var h = canvas.height;
        var c = $("<canvas>").get(0);
        c.width = w;
        c.height = h;
        var drawctx = c.getContext("2d");
        var ctx3d = canvas.getContext("webgl");
        const webglPixels = new Uint8Array(4 * w * h);

        //in what was probably a horrible design decision,
        //the ordering of pixels extracted from a webgl context is
        //flipped vertically from that of a 2d
        ctx3d.readPixels(0,0,w,h,ctx3d.RGBA,ctx3d.UNSIGNED_BYTE,webglPixels);

        var idata = drawctx.getImageData(0, 0, w, h);

        idata.data.set(webglPixels);
        //so we flip
        drawctx.putImageData(idata, 0, 0);  
        drawctx.scale(1, -1);
        drawctx.drawImage(c, 0, -h);
        return c.toDataURL("image/png"); // standard in 2d
    }

    var beginTime = Date.now();
    var failures = 0;
    resemble.outputSettings({
        useCrossOrigin: false
    });
    
    function runTest(i){
        if(i == keys.length) {
            //finished
            var endTime = Date.now();
            $('#summary_list').append('<li class="totaltime">Total time: '+(endTime-beginTime)/1000+'s'+'</p>');
            $('#summary_list').append('<li class="failures">Total failures: '+failures+'</p>');
            return;
        }
        console.log("%c-------------------------- "+keys[i]+" -----------------------------",'background: green; color: white; display: block;')
        var before=Date.now();
        var key=keys[i];
        
        var viewer=$3Dmol.createViewer($("#gldiv"),{id:key});
        var afterGlobals;
        var nexti = i+1; //just in case exception happens after i increment

        //create the table row
        var tableRow=createRow(key);
        var percentage=$('<p class="percentage">');
        tableRow.find(".label").append(percentage);
        par.html("   "+(i+1)+"/"+keys.length);

        //setup error handling
        var setError = function(msg) {
            var listElement=$('<li class="erroritem">').append('<a href="#'+key+'_row">'+key+' '+msg+'</a>');
            tableRow.find('.label').css('backgroundColor','red');
            $('#summary_list').append(listElement)
            percentage.html(msg);
            failures++;
        }
        
        //override default error handling (try/catch isn't sufficient due to callbacks)
        window.onerror = function(message, file, lineNumber) {
            setError(message);
            failures++;
            setTimeout(function() {runTest(nexti);}, 1); //let page update  
            return true; 
          };
          
        system[key](viewer,function(){
            waitfor(function() { return viewer.surfacesFinished() && !viewer.isAnimated() } , true , 100 , 0 , "" , function(){
                var after=Date.now();
                //gets the canvas
                var canvas=$("canvas#"+key).get(0);
                //creates an image for the canvas
                var canvasImageData = imageFromWebGlCanvas(canvas);
                var canvasImage=$("<img class='referenceImage'>").attr('src',canvasImageData);

                //click event for canvas
                canvasImage.click(function(){
                    var win = window.open();
                    win.location="generate_test.cgi?test="+key;
                });
                tableRow.find('.rendered').append(canvasImage);
                $('#tests').find('tbody').append(tableRow);

                var differenceImage=$('<img>');
                var differ=0;

                var diff = resemble(canvasImageData).compareTo("imgs/"+key+".png").set3DmolTolerances().scaleToSameSize().onComplete(function(data){
                    //scaletosamesize is necessary for retina displays
                    differ=data.rawMisMatchPercentage;//(100-blankDiff);
                    percentage.html(differ+'<br>'+(after-before)+'ms');
                    differenceImage.attr('src',data.getImageDataUrl());
                    tableRow.find('.difference').append(differenceImage);
                    
                    //compare globals before and after
                    afterGlobals=GlobalTester.after(window);
                    
                    if(afterGlobals.length > 0) {
                        setError("Globals added: "+afterGlobals);
                    } else if(differ>5){
                        setError(differ);
                    } else{
                        tableRow.find(".label").css('backgroundColor',"green");
                    }
                    
                    //remove possible div
                    $(".viewer_3Dmoljs").remove();
                    //remove canvas
                    $(canvas).remove();
                    
                    setTimeout(function() {runTest(nexti);}, 1); //let page update             
                }); //end onComplete
            });
            
        });
            
    }    
    
    //initialize a viewer since jquery adds some event handling stuff to the window
    //that we don't want to caught by the global tester
    $3Dmol.createViewer($("#gldiv"));    
    GlobalTester.before(window);     
    
    runTest(0);
});
