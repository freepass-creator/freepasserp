
(function(){
  function waitForSampleData(callback, retries){
    retries = retries || 20; // max ~1s
    if(window.FREEPASS_SAMPLE){
      callback(window.FREEPASS_SAMPLE);
    } else if(retries > 0){
      setTimeout(function(){
        waitForSampleData(callback, retries - 1);
      }, 50);
    } else {
      console.error("[FREEPASS] 샘플데이터 로드 실패");
    }
  }

  document.addEventListener("DOMContentLoaded", function(){
    const pre = document.getElementById("sample-data-json");
    if(!pre) return;

    waitForSampleData(function(data){
      pre.textContent = JSON.stringify(data, null, 2);
    });
  });
})();
