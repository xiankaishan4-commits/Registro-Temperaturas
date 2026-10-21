package com.shanfoodsgroup.temperaturas;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.view.View;
import android.view.Window;
import android.database.Cursor;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String HOST="appassets.androidplatform.net";
    private static final int REQUEST_FILE=200;
    private static final int REQUEST_EXPORT=201;
    private static final String AUTH="com.shanfoodsgroup.temperaturas.backups";
    private WebView view;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private File pendingFile;
    private String pendingFilename;
    private FileOutputStream backupStream;
    private File workingFile;
    private final Object backupLock=new Object();
    private final Handler main=new Handler(Looper.getMainLooper());

    @Override public void onCreate(Bundle bundle){
        super.onCreate(bundle);
        getWindow().setStatusBarColor(Color.rgb(18,79,69));
        view=new WebView(this);
        view.setBackgroundColor(Color.WHITE);
        setContentView(view);
        WebSettings settings=view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        view.addJavascriptInterface(new BackupBridge(),"AndroidBridge");
        view.addJavascriptInterface(new ReminderBridge(), "ReminderBridge");
        ReminderScheduler.scheduleNext(this);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 311);
        }
        view.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){
                Uri u=request.getUrl();
                return !("https".equals(u.getScheme())&&HOST.equals(u.getHost()));
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){
                Uri u=request.getUrl();
                if(!"https".equals(u.getScheme())||!HOST.equals(u.getHost())){
                    return errorResponse();
                }
                String path=u.getPath();
                if(path==null||path.equals("/")||path.isEmpty())path="/index.html";
                if(!path.startsWith("/assets/"))return errorResponse();
                path=path.substring("/assets/".length());
                // Assets are a fixed whitelist. Do not expose private Android app files.
                if(!path.matches("(index\\.html|app\\.js|records-core\\.js|report-core\\.js|styles\\.css|icon-192\\.png|icon-512\\.png|manifest\\.webmanifest)"))return errorResponse();
                String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":"application/manifest+json";
                try{
                    InputStream in=getAssets().open(path);
                    WebResourceResponse response=new WebResourceResponse(mime,path.endsWith(".png")?null:"UTF-8",in);
                    response.setResponseHeaders(java.util.Collections.singletonMap("Cache-Control","no-store"));
                    return response;
                }catch(IOException ex){return errorResponse();}
            }
        });
        view.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView webView,android.webkit.ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);
                fileCallback=callback;
                String accepts=String.join(",",params.getAcceptTypes()).toLowerCase(Locale.ROOT);
                boolean picture=accepts.contains("image");
                try{
                    Intent picker;
                    if(picture){
                        picker=new Intent(Intent.ACTION_GET_CONTENT);
                        picker.addCategory(Intent.CATEGORY_OPENABLE);
                        picker.setType("image/*");
                        Intent camera=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        ContentValues values=new ContentValues();
                        values.put(MediaStore.Images.Media.DISPLAY_NAME,"termometro_"+System.currentTimeMillis()+".jpg");
                        values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
                        values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/Temperaturas");
                        cameraUri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
                        if(cameraUri!=null){
                            camera.putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);
                            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                            Intent chooser=Intent.createChooser(picker,"Cámara o galería");
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,new Intent[]{camera});
                            startActivityForResult(chooser,REQUEST_FILE);
                        }else startActivityForResult(Intent.createChooser(picker,"Seleccionar foto"),REQUEST_FILE);
                    }else{
                        picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        picker.addCategory(Intent.CATEGORY_OPENABLE);
                        picker.setType("*/*");
                        picker.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/zip","application/x-zip-compressed","application/json","application/octet-stream"});
                        startActivityForResult(picker,REQUEST_FILE);
                    }
                    return true;
                }catch(Exception ex){
                    fileCallback=null;
                    if(cameraUri!=null){getContentResolver().delete(cameraUri,null,null);cameraUri=null;}
                    callback.onReceiveValue(null);
                    toast("No se ha podido abrir la cámara o los archivos.");
                    return true;
                }
            }
        });
        view.loadUrl("https://"+HOST+"/assets/index.html");
    }

    private WebResourceResponse errorResponse(){
        return new WebResourceResponse("text/plain","UTF-8",404,"Not found",java.util.Collections.emptyMap(),
            new java.io.ByteArrayInputStream(new byte[0]));
    }

    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==REQUEST_FILE){
            Uri[] selected=null;
            if(result==RESULT_OK){
                if(data!=null&&data.getClipData()!=null){
                    int n=data.getClipData().getItemCount();
                    selected=new Uri[n];
                    for(int i=0;i<n;i++)selected[i]=data.getClipData().getItemAt(i).getUri();
                }else if(data!=null&&data.getData()!=null){selected=new Uri[]{data.getData()};}
                else if(cameraUri!=null)selected=new Uri[]{cameraUri};
            }
            boolean usedCamera=selected!=null&&selected.length==1&&cameraUri!=null&&cameraUri.equals(selected[0]);
            if(!usedCamera&&cameraUri!=null){getContentResolver().delete(cameraUri,null,null);}
            cameraUri=null;
            if(fileCallback!=null){fileCallback.onReceiveValue(selected);fileCallback=null;}
        }else if(request==REQUEST_EXPORT){
            if(result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingFile!=null){
                final Uri location=data.getData();
                final File input=pendingFile;
                new Thread(()->{
                    boolean success=false;
                    try(InputStream in=new FileInputStream(input);OutputStream out=getContentResolver().openOutputStream(location,"w")){
                        if(out==null)throw new IOException("No se puede abrir el destino");
                        byte[] chunk=new byte[64*1024];int len;
                        while((len=in.read(chunk))!=-1)out.write(chunk,0,len);
                        success=true;
                    }catch(Exception ignored){}
                    final boolean done=success;
                    main.post(()->toast(done?"Archivo guardado. Comprueba el PDF, CSV o la copia en Archivos o Drive.":"Error al guardar el archivo."));
                    if(!input.delete())input.deleteOnExit();
                }).start();
            }else{
                if(pendingFile!=null)pendingFile.delete();
                toast("Guardado cancelado. Los registros siguen en este teléfono.");
            }
            pendingFile=null;
            pendingFilename=null;
        }
    }

    private void toast(String value){main.post(()->Toast.makeText(this,value,Toast.LENGTH_LONG).show());}

    private void exportFile(File file,String name,String mode){
        pendingFile=file;
        pendingFilename=name;
        if(mode.equals("share")){
            // Our provider streams the ZIP directly to the selected app (e.g. Google Drive).
            Uri uri=new Uri.Builder().scheme("content").authority(AUTH).appendPath(name).build();
            Intent send=new Intent(Intent.ACTION_SEND);
            send.setType(exportMime(name));
            send.putExtra(Intent.EXTRA_STREAM,uri);
            send.setClipData(android.content.ClipData.newRawUri(name,uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send,"Compartir copia"));
        }else{
            Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);
            save.addCategory(Intent.CATEGORY_OPENABLE);
            save.setType(exportMime(name));
            save.putExtra(Intent.EXTRA_TITLE,name);
            startActivityForResult(save,REQUEST_EXPORT);
        }
    }

    private String exportMime(String name) {
        if (name.endsWith(".csv")) return "text/csv";
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".json")) return "application/json";
        return "application/zip";
    }

    private class ReminderBridge {
        @JavascriptInterface public void sync(String stateJson) {
            ReminderScheduler.saveSnapshot(MainActivity.this, stateJson);
        }
    }

    private class BackupBridge{
        // Large photo reports arrive as an offline, private ZIP stream via begin/append/finish.
        // The ZIP is converted into a human-readable PDF and never offered as a backup.
        private void generatePdfReport(File input) {
            File pdf = new File(getCacheDir(), "pdf_report_" + System.currentTimeMillis() + ".pdf");
            try {
                PdfReportWriter.write(input, pdf);
                main.post(() -> exportFile(pdf, "Informe_Temperaturas_" +
                    new java.text.SimpleDateFormat("yyyy-MM-dd_HHmm", java.util.Locale.ROOT)
                        .format(new java.util.Date()) + ".pdf", "save"));
            } catch (Exception e) {
                pdf.delete();
                toast("No se ha podido generar el PDF: " + e.getMessage());
            } finally { input.delete(); }
        }
        @JavascriptInterface public void begin(String filename){
            synchronized(backupLock){
                closeStream();
                if(filename==null||!filename.matches("[a-zA-Z0-9_.-]{1,120}")||(!filename.endsWith(".zip")&&!filename.endsWith(".csv")&&!filename.endsWith(".pdf")&&!filename.endsWith(".json")))throw new IllegalArgumentException("Nombre no válido");
                try{
                    File dest=new File(getCacheDir(),"export_"+System.currentTimeMillis()+"_"+filename);
                    workingFile=dest;backupStream=new FileOutputStream(dest);
                    pendingFilename=filename;
                }catch(IOException ex){throw new IllegalStateException("Almacenamiento no disponible");}
            }
        }
        @JavascriptInterface public void append(String base64){
            synchronized(backupLock){
                if(backupStream==null)throw new IllegalStateException("Exportación no iniciada");
                try{backupStream.write(Base64.decode(base64,Base64.DEFAULT));}
                catch(IOException ex){throw new IllegalStateException("No queda espacio para preparar la copia");}
            }
        }
        @JavascriptInterface public void finish(String mode){
            synchronized(backupLock){
                closeStream();
                final File file=workingFile;
                final String name=pendingFilename;
                workingFile=null;
                if(file==null)throw new IllegalStateException("No hay copia");
                if("pdfReport".equals(mode)) {
                    if (!"informe_interno.zip".equals(name)) {
                        file.delete(); throw new IllegalArgumentException("Paquete PDF no válido");
                    }
                    new Thread(() -> generatePdfReport(file), "temperaturas-pdf-offline").start();
                } else {
                    main.post(()->exportFile(file,name,"share".equals(mode)?"share":"save"));
                }
            }
        }
        @JavascriptInterface public void cancel(){
            synchronized(backupLock){
                closeStream();
                if(workingFile!=null)workingFile.delete();
                workingFile=null;
            }
        }
        private void closeStream(){if(backupStream!=null)try{backupStream.close();backupStream=null;}catch(IOException ignored){backupStream=null;}}
    }

    @Override public void onBackPressed(){
        // Keep this single-page app open unless user presses back twice.
        if(view!=null&&view.canGoBack())view.goBack();else super.onBackPressed();
    }
    @Override protected void onDestroy(){
        if(view!=null)view.destroy();
        super.onDestroy();
    }
}
