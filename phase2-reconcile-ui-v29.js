(() => {
  if(document.getElementById('chartTooltipBandStyleV29')) return;
  const style=document.createElement('style');
  style.id='chartTooltipBandStyleV29';
  style.textContent=`
    #bankChartTipV20,#cashflowTipV21{
      position:static!important;
      left:auto!important;
      top:auto!important;
      right:auto!important;
      max-width:none!important;
      width:100%!important;
      margin-top:8px!important;
      box-shadow:none!important;
      min-height:76px;
    }
    #bankChartTipV20.hidden,#cashflowTipV21.hidden{
      display:block!important;
      visibility:hidden!important;
      pointer-events:none!important;
    }
    #bankChartTipV20:not(.hidden),#cashflowTipV21:not(.hidden){
      visibility:visible!important;
    }
    #bankChartPlotV20,#cashflowChartPlotV21{overflow:visible}
  `;
  document.head.appendChild(style);
})();