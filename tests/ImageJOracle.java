// Independent reference generator: runs the unmodified public-domain ImageJ1 engine.
// javac -cp /path/to/ij.jar tests/ImageJOracle.java
// java -Djava.awt.headless=true -cp tests:/path/to/ij.jar ImageJOracle output.json
import ij.process.*;
import ij.gui.OvalRoi;
import ij.plugin.filter.BackgroundSubtracter;
import java.nio.file.*;
public class ImageJOracle {
  public static void main(String[] args) throws Exception {
    StringBuilder out=new StringBuilder("{\"source\":\"ImageJ1 "+ij.IJ.getVersion()+" unmodified BackgroundSubtracter\",\"cases\":[");boolean first=true;
    for(int depth:new int[]{8,16}) for(int radius:new int[]{1,5,10,11,20,30,31,50,100}) for(boolean smooth:new boolean[]{false,true}) for(boolean dark:new boolean[]{false,true}) {
      int w=23,h=17,max=(1<<depth)-1;
      ImageProcessor ip=depth==8?new ByteProcessor(w,h):new ShortProcessor(w,h);
      for(int y=0;y<h;y++)for(int x=0;x<w;x++){int value=max/2+(x*37+y*23+(x*y)%11)%(max/4);if(x>7&&x<15&&y>4&&y<12)value-=max/3;ip.set(x,y,value);}
      new BackgroundSubtracter().rollingBallBackground(ip,radius,false,dark,false,smooth,true);
      if(!first)out.append(',');first=false;
      out.append("{\"depth\":").append(depth).append(",\"radius\":").append(radius).append(",\"smooth\":").append(smooth).append(",\"dark\":").append(dark).append(",\"width\":").append(w).append(",\"height\":").append(h).append(",\"expected\":[");
      for(int i=0;i<w*h;i++){if(i>0)out.append(',');out.append(dark?max-ip.get(i):ip.get(i));}out.append("]}");
    }
    out.append("],\"ellipses\":[");first=true;
    for(int w=1;w<=9;w++)for(int h=1;h<=9;h++){
      ImageProcessor mask=new OvalRoi(0,0,w,h).getMask();int area=0;for(int i=0;i<w*h;i++)if(mask.get(i)!=0)area++;
      if(!first)out.append(',');first=false;out.append("{\"w\":").append(w).append(",\"h\":").append(h).append(",\"area\":").append(area).append('}');
    }
    out.append("]}");Files.writeString(Path.of(args[0]),out.toString());
  }
}
