import {createThreatReportDownload} from './ThreatReportPdf';
import type {ExportScope,ReportFilterSnapshot,ThreatReportData} from './threatReportExportModel';

type PdfRequest={id:string;report:ThreatReportData;scope:ExportScope;filters:ReportFilterSnapshot};

self.onmessage=async(event:MessageEvent<PdfRequest>)=>{
  const {id,report,scope,filters}=event.data;
  try{
    const result=await createThreatReportDownload(report,scope,filters,percent=>self.postMessage({id,type:'progress',percent}));
    self.postMessage({id,type:'complete',blob:result.blob,filename:result.filename});
  }catch(error){
    self.postMessage({id,type:'error',message:error instanceof Error?error.message:'The PDF could not be generated.'});
  }
};
