def each_value(value)
  if value.is_a?(Array)
    value.each { |v| yield v }
  else
    yield value
  end
end

each_value("string_value") do |v|
  p(v)
end
each_value(["str1", "str2", "str3"]) do |v|
  p(v)
end
